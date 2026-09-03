import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleReportsRequest, type ReportsHandlerDependencies } from '../api/reports';

const usage = {
  period: '2026-08', plan: 'free' as const, completed: 1, reserved: 0, limit: 5, remaining: 4,
};

function dependencies(): ReportsHandlerDependencies {
  return {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'verified-uid', email: 'owner@example.com' }),
    list: vi.fn().mockResolvedValue([]),
    usage: vi.fn().mockResolvedValue(usage),
    delete: vi.fn().mockResolvedValue(undefined),
    sweepUploads: vi.fn().mockResolvedValue(0),
  };
}

function historyRequest() {
  return new Request('https://example.test/api/reports', {
    method: 'GET',
    headers: { authorization: 'Bearer valid' },
  });
}

afterEach(() => vi.restoreAllMocks());

describe('orphaned upload sweep', () => {
  it('sweeps under the verified UID when history is loaded', async () => {
    // Uploads that never reach /api/analysis have nothing to clean them up.
    // This repairs them on the same path stale reservations already use.
    const deps = dependencies();

    const response = await handleReportsRequest(historyRequest(), deps);

    expect(response.status).toBe(200);
    expect(deps.sweepUploads).toHaveBeenCalledWith('verified-uid');
  });

  it('never sweeps for an unauthenticated caller', async () => {
    const deps = dependencies();

    const response = await handleReportsRequest(
      new Request('https://example.test/api/reports', { method: 'GET' }),
      deps,
    );

    expect(response.status).toBe(401);
    expect(deps.sweepUploads).not.toHaveBeenCalled();
  });

  it('still returns history when storage is unavailable', async () => {
    // A storage outage must never stop a customer seeing their reports.
    const deps = dependencies();
    vi.mocked(deps.sweepUploads).mockRejectedValue(new Error('storage unreachable'));

    const response = await handleReportsRequest(historyRequest(), deps);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ usage: { remaining: 4 } });
  });

  it('does not sweep on delete', async () => {
    // Deleting one report should not trigger bucket enumeration.
    const deps = dependencies();

    const response = await handleReportsRequest(
      new Request('https://example.test/api/reports', {
        method: 'DELETE',
        headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
        body: JSON.stringify({ reportId: '7f6e6f6b-38d5-4a24-9541-90aa8d91ff21' }),
      }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(deps.sweepUploads).not.toHaveBeenCalled();
  });
});
