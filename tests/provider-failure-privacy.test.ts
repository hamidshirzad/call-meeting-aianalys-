import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAnalysisRequest, type AnalysisHandlerDependencies } from '../api/analysis';
import type { UsageReservation } from '../api/_lib/analysis-repository';

const reservation: UsageReservation = {
  uid: 'verified-uid', id: 'request-id', period: '2026-08', plan: 'free', limit: 5,
};

/**
 * Every private value the provider error, request, or user could contain. None
 * may appear in a log line or in the response body.
 */
const SECRETS = [
  'sb_secret_abcdef123456',
  'AIzaSyPRETENDGEMINIKEY0000',
  'owner@example.com',
  'verified-uid',
  'users/verified-uid/uploads/9f1-meeting-2026-08-29.m4a',
  'meeting-2026-08-29T19-32-09-488Z.m4a',
  'https://generativelanguage.googleapis.com/v1beta/files/abc123xyz',
  'files/abc123xyz',
  'Analyze this sales call as a practical sales coach',
  'So then the customer said their budget was forty thousand',
];

/** A provider 400 whose body is saturated with values that must not escape. */
function leakyProviderError() {
  const error = new Error(JSON.stringify({
    error: {
      code: 400,
      status: 'INVALID_ARGUMENT',
      message: `Request rejected while reading ${SECRETS[6]} for ${SECRETS[3]} (${SECRETS[2]}). `
        + `Object ${SECRETS[4]} named ${SECRETS[5]}. Prompt began "${SECRETS[8]}". `
        + `Transcript fragment: "${SECRETS[9]}". Credentials ${SECRETS[0]} ${SECRETS[1]}.`,
      details: [{
        '@type': 'type.googleapis.com/google.rpc.BadRequest',
        fieldViolations: [{ field: 'response_format.schema.type', description: SECRETS[9] }],
      }],
    },
  }));
  Object.assign(error, { status: 400, name: 'ApiError' });
  return error;
}

function dependencies(): AnalysisHandlerDependencies {
  return {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'verified-uid', email: 'owner@example.com' }),
    inspectUpload: vi.fn().mockResolvedValue({ size: 1_024, contentType: 'audio/m4a' }),
    downloadUpload: vi.fn().mockResolvedValue(undefined),
    deleteUpload: vi.fn().mockResolvedValue(undefined),
    readDuration: vi.fn().mockResolvedValue(120),
    reserve: vi.fn().mockResolvedValue(reservation),
    startAnalysis: vi.fn().mockRejectedValue(leakyProviderError()),
    createJob: vi.fn().mockResolvedValue(undefined),
    deleteGeminiFile: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    usage: vi.fn().mockResolvedValue({
      period: '2026-08', plan: 'free', completed: 0, reserved: 0, limit: 5, remaining: 5,
    }),
    removeLocalFile: vi.fn().mockResolvedValue(undefined),
  };
}

function analysisRequest() {
  return new Request('https://example.test/api/analysis', {
    method: 'POST',
    headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
    body: JSON.stringify({
      storagePath: 'users/verified-uid/uploads/9f1-meeting-2026-08-29.m4a',
      originalName: 'meeting-2026-08-29T19-32-09-488Z.m4a',
    }),
  });
}

afterEach(() => vi.restoreAllMocks());

describe('provider failure privacy', () => {
  it('keeps every private value out of logs and the response', async () => {
    const logged: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args) => {
      logged.push(args.map((value) => JSON.stringify(value)).join(' '));
    });
    vi.spyOn(console, 'info').mockImplementation((...args) => {
      logged.push(args.map((value) => JSON.stringify(value)).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      logged.push(args.map((value) => JSON.stringify(value)).join(' '));
    });

    const response = await handleAnalysisRequest(analysisRequest(), dependencies());
    const body = await response.text();
    const logs = logged.join('\n');

    for (const secret of SECRETS) {
      expect(logs, `leaked to logs: ${secret}`).not.toContain(secret);
      expect(body, `leaked to response: ${secret}`).not.toContain(secret);
    }
  });

  it('records only fixed enums, a status, an allowlisted field, and our own flags', async () => {
    const entries: Array<[string, unknown]> = [];
    vi.spyOn(console, 'warn').mockImplementation((label, payload) => {
      entries.push([String(label), payload]);
    });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await handleAnalysisRequest(analysisRequest(), dependencies());

    const failure = entries.find(([label]) => label === 'analysis_provider_failure');
    expect(failure).toBeDefined();
    expect(Object.keys(failure![1] as object).sort()).toEqual([
      'canonicalStatus', 'category', 'fieldPath', 'providerStatus',
      'reason', 'requestFeatures', 'requestId',
    ]);
    expect(failure![1]).toMatchObject({
      providerStatus: 400,
      category: 'request_rejected',
      reason: 'response_schema',
      canonicalStatus: 'INVALID_ARGUMENT',
      fieldPath: 'response_format',
    });
  });

  it('does not blame the recording for a non-media rejection', async () => {
    // The reported failures were classified as audio problems with no evidence.
    // Telling a customer to re-export audio that was never the cause sends them
    // in circles and hides a server-side defect.
    const response = await handleAnalysisRequest(analysisRequest(), dependencies());
    const body = await response.json() as { error?: { code?: string; message?: string } };

    expect(body.error?.code).toBe('ANALYSIS_PROVIDER_FAILED');
    expect(body.error?.message).not.toMatch(/could not read this audio|export it as/i);
    expect(body.error?.message).toMatch(/not charged/i);
  });

  it('still blames the media when the provider names a media field', async () => {
    const deps = dependencies();
    const mediaError = new Error(JSON.stringify({
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        message: 'Request contains an invalid argument.',
        details: [{ fieldViolations: [{ field: 'input[0].mime_type' }] }],
      },
    }));
    Object.assign(mediaError, { status: 400, name: 'ApiError' });
    vi.mocked(deps.startAnalysis).mockRejectedValue(mediaError);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const response = await handleAnalysisRequest(analysisRequest(), deps);
    const body = await response.json() as { error?: { code?: string } };

    expect(response.status).toBe(422);
    expect(body.error?.code).toBe('ANALYSIS_AUDIO_UNREADABLE');
  });

  it('releases quota and deletes the upload on a provider rejection', async () => {
    const deps = dependencies();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await handleAnalysisRequest(analysisRequest(), deps);

    expect(deps.createJob).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledWith(reservation);
    expect(deps.deleteUpload).toHaveBeenCalledOnce();
    expect(deps.removeLocalFile).toHaveBeenCalledOnce();
  });
});
