import { GoogleGenAI, FileState } from '@google/genai';
import { loadGeminiEnvironment } from './server-env.js';
import type {
  CoachingCardData,
  DiarizedSegment,
  SalesCallAnalysisReport,
  SentimentData,
} from '../../types.js';

const reportSchema = {
  type: 'object',
  properties: {
    diarizedTranscript: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speaker: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['speaker', 'text'],
      },
    },
    sentimentData: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          segmentIndex: { type: 'integer' },
          score: { type: 'number' },
        },
        required: ['segmentIndex', 'score'],
      },
    },
    coachingCard: {
      type: 'object',
      properties: {
        strengths: { type: 'array', items: { type: 'string' } },
        opportunities: { type: 'array', items: { type: 'string' } },
      },
      required: ['strengths', 'opportunities'],
    },
    summary: { type: 'string' },
  },
  required: ['diarizedTranscript', 'sentimentData', 'coachingCard', 'summary'],
} as const;

const prompt = `Analyze this sales call as a practical sales coach.
Return an accurate speaker-diarized transcript, sentiment scores from -1 to 1 for transcript
segments, concise strengths, concrete improvement opportunities, and a short executive summary.
Do not invent dialogue that is not audible. If speaker names are unknown, use Speaker 1,
Speaker 2, and so on. Keep advice specific, respectful, and grounded in the call.`;

type GeneratedReport = Omit<SalesCallAnalysisReport, 'id' | 'timestamp'>;
export type GeminiAnalysisStage =
  | 'gemini_upload_started'
  | 'gemini_upload_retry'
  | 'gemini_upload_completed'
  | 'gemini_file_ready'
  | 'gemini_generation_started'
  | 'gemini_generation_completed';

/**
 * Optional Interactions capabilities this request opts into.
 *
 * Logged on failure so a rejection carrying no field attribution can still be
 * narrowed by elimination. These are our own request parameters — fixed
 * booleans, never provider data or user content.
 */
export const GEMINI_REQUEST_FEATURES = Object.freeze({
  background: true,
  store: true,
  structuredOutput: true,
});

const GEMINI_UPLOAD_TIMEOUT_MS = 60_000;
const GEMINI_GENERATION_TIMEOUT_MS = 30_000;
const GEMINI_UPLOAD_RETRY_DELAYS_MS = [1_500, 4_000] as const;

export function geminiProviderStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) return null;
  const status = Number((error as { status?: unknown }).status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : null;
}

export type GeminiProviderReason =
  | 'media_format'
  | 'response_schema'
  | 'model_capability'
  | 'background_execution'
  | 'file_reference'
  | 'request_shape'
  | 'unknown';

export interface GeminiProviderDiagnostic {
  reason: GeminiProviderReason;
  /** Canonical google.rpc.Code name, e.g. INVALID_ARGUMENT. Allowlisted. */
  canonicalStatus: string | null;
  /** Rejected API field path, e.g. response_format.schema. Allowlisted. */
  fieldPath: string | null;
}

/**
 * Canonical google.rpc.Code names. Allowlisted so an unrecognised provider
 * value can never reach a log line.
 */
const CANONICAL_STATUSES = new Set([
  'CANCELLED', 'UNKNOWN', 'INVALID_ARGUMENT', 'DEADLINE_EXCEEDED', 'NOT_FOUND',
  'ALREADY_EXISTS', 'PERMISSION_DENIED', 'RESOURCE_EXHAUSTED', 'FAILED_PRECONDITION',
  'ABORTED', 'OUT_OF_RANGE', 'UNIMPLEMENTED', 'INTERNAL', 'UNAVAILABLE',
  'DATA_LOSS', 'UNAUTHENTICATED',
]);

/**
 * Request fields the Interactions API can reject, mapped to a fixed reason.
 *
 * Only these paths are ever recorded. They are API schema names documented in
 * the SDK's CreateModelInteraction type, never user content, so they carry no
 * audio, transcript, identity, or storage information.
 */
const FIELD_REASONS: ReadonlyArray<readonly [string, GeminiProviderReason]> = [
  ['input.mime_type', 'media_format'],
  ['input.uri', 'file_reference'],
  ['response_format', 'response_schema'],
  ['response_mime_type', 'response_schema'],
  ['response_modalities', 'response_schema'],
  ['generation_config', 'request_shape'],
  ['safety_settings', 'request_shape'],
  ['system_instruction', 'request_shape'],
  ['tools', 'request_shape'],
  ['labels', 'request_shape'],
  ['environment', 'request_shape'],
  ['service_tier', 'request_shape'],
  ['webhook_config', 'request_shape'],
  ['previous_interaction_id', 'request_shape'],
  ['background', 'background_execution'],
  ['store', 'background_execution'],
  ['stream', 'background_execution'],
  ['model', 'model_capability'],
  ['input', 'request_shape'],
];

function providerErrorBody(error: unknown): Record<string, unknown> | null {
  const raw = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  if (!raw.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(raw.slice(0, 20_000)) as Record<string, unknown>;
    const body = parsed.error;
    return body && typeof body === 'object' ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/**
 * Reduces a provider field reference to an allowlisted API path.
 *
 * Array indices and any leading request wrapper are stripped so that
 * `body.input[0].mime_type` and `input.mime_type` classify identically.
 * Anything not matching a known field returns null rather than being recorded.
 */
function allowlistedFieldPath(candidate: string): string | null {
  const normalized = candidate
    .trim()
    .replace(/\[\d+\]/g, '')
    .replace(/^body\./, '')
    .replace(/^\$\./, '');
  if (!/^[a-z0-9_.]{1,80}$/i.test(normalized)) return null;

  const segments = normalized.split('.').filter(Boolean);
  for (const [path] of FIELD_REASONS) {
    const wanted = path.split('.');
    // input.mime_type must also match input[0].mime_type -> input.mime_type,
    // and response_format must match response_format.schema.type.
    if (wanted.length === 1 && segments[0] === wanted[0]) return wanted[0];
    if (
      wanted.length === 2 &&
      segments[0] === wanted[0] &&
      segments.includes(wanted[1])
    ) {
      return path;
    }
  }
  return null;
}

function fieldCandidates(body: Record<string, unknown>): string[] {
  const candidates: string[] = [];

  const details = Array.isArray(body.details) ? body.details : [];
  for (const detail of details) {
    if (!detail || typeof detail !== 'object') continue;
    const violations = (detail as { fieldViolations?: unknown }).fieldViolations;
    if (!Array.isArray(violations)) continue;
    for (const violation of violations) {
      const field = violation && typeof violation === 'object'
        ? (violation as { field?: unknown }).field
        : undefined;
      if (typeof field === 'string') candidates.push(field);
    }
  }

  // Field-name errors are frequently reported only in the message text.
  const message = typeof body.message === 'string' ? body.message.slice(0, 2_000) : '';
  for (const pattern of [/unknown name "([^"]{1,80})"/gi, /invalid value at '([^']{1,80})'/gi]) {
    for (const match of message.matchAll(pattern)) candidates.push(match[1]);
  }

  return candidates;
}

function reasonForField(path: string): GeminiProviderReason {
  for (const [candidate, reason] of FIELD_REASONS) {
    if (path === candidate || path.startsWith(`${candidate}.`)) return reason;
  }
  return 'unknown';
}

function keywordReason(error: unknown): GeminiProviderReason {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  const bounded = message.toLowerCase().slice(0, 2_000);
  if (/mime|codec|audio format|media format|decode|container/.test(bounded)) return 'media_format';
  if (/response.?format|response.?schema|json schema|structured output/.test(bounded)) return 'response_schema';
  if (/background/.test(bounded)) return 'background_execution';
  if (/model.+(support|capab)|not supported.+model/.test(bounded)) return 'model_capability';
  if (/file|uri/.test(bounded)) return 'file_reference';
  return 'unknown';
}

/**
 * Classifies a provider failure from evidence the SDK already carries.
 *
 * The SDK builds ApiError.message as JSON.stringify of the full provider error
 * body, so the canonical status and the exact rejected field path are present
 * but were previously discarded in favour of matching keywords against prose.
 * Structured extraction is tried first; the keyword pass remains as a fallback
 * for provider errors that carry no field reference.
 *
 * Only allowlisted values are returned, so neither the raw provider message nor
 * any request content can reach a log line.
 */
export function geminiProviderDiagnostic(error: unknown): GeminiProviderDiagnostic {
  const body = providerErrorBody(error);
  const rawStatus = body && typeof body.status === 'string' ? body.status : null;
  const canonicalStatus = rawStatus && CANONICAL_STATUSES.has(rawStatus) ? rawStatus : null;

  if (body) {
    for (const candidate of fieldCandidates(body)) {
      const fieldPath = allowlistedFieldPath(candidate);
      if (fieldPath) {
        return { reason: reasonForField(fieldPath), canonicalStatus, fieldPath };
      }
    }
  }

  return { reason: keywordReason(error), canonicalStatus, fieldPath: null };
}

export function geminiProviderReason(error: unknown): GeminiProviderReason {
  return geminiProviderDiagnostic(error).reason;
}

function retryableProviderStatus(status: number | null): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function uploadGeminiFile(
  client: GoogleGenAI,
  filePath: string,
  mimeType: string,
  onStage?: (stage: GeminiAnalysisStage) => void,
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.files.upload({
        file: filePath,
        // Bound the local request without passing SDK HTTP overrides into the
        // resumable upload handshake. The latter produced provider 404s in the
        // Vercel runtime even though the same Files endpoint worked without it.
        config: { mimeType, abortSignal: AbortSignal.timeout(GEMINI_UPLOAD_TIMEOUT_MS) },
      });
    } catch (error) {
      const delay = GEMINI_UPLOAD_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !retryableProviderStatus(geminiProviderStatus(error))) throw error;
      onStage?.('gemini_upload_retry');
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function boundedString(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function parseTranscript(value: unknown): DiarizedSegment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 1_500).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const speaker = boundedString((entry as { speaker?: unknown }).speaker, 80);
    const text = boundedString((entry as { text?: unknown }).text, 4_000);
    return speaker && text ? [{ speaker, text }] : [];
  });
}

function parseSentiment(value: unknown, transcriptLength: number): SentimentData[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, transcriptLength).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const segmentIndex = Number((entry as { segmentIndex?: unknown }).segmentIndex);
    const score = Number((entry as { score?: unknown }).score);
    if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || !Number.isFinite(score)) return [];
    return [{ segmentIndex, score: Math.max(-1, Math.min(1, score)) }];
  });
}

function parseList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 12)
    .map((entry) => boundedString(entry, 800))
    .filter(Boolean);
}

export function parseGeminiReport(value: string): GeneratedReport {
  const parsed = JSON.parse(value) as Record<string, unknown>;
  const diarizedTranscript = parseTranscript(parsed.diarizedTranscript);
  const coaching = parsed.coachingCard as Record<string, unknown> | undefined;
  const coachingCard: CoachingCardData = {
    strengths: parseList(coaching?.strengths),
    opportunities: parseList(coaching?.opportunities),
  };
  const summary = boundedString(parsed.summary, 6_000);

  if (!summary || diarizedTranscript.length === 0) {
    throw new Error('Gemini returned an incomplete analysis.');
  }

  return {
    diarizedTranscript,
    sentimentData: parseSentiment(parsed.sentimentData, diarizedTranscript.length),
    coachingCard,
    summary,
  };
}

export interface StartedGeminiAnalysis {
  interactionId: string;
  geminiFileName: string;
}

export type GeminiJobResult =
  | { status: 'processing' }
  | { status: 'completed'; report: GeneratedReport }
  | { status: 'failed' };

async function waitForActiveFile(
  client: GoogleGenAI,
  file: { name?: string; state?: FileState; uri?: string; mimeType?: string },
) {
  let current = file;
  for (let attempt = 0; attempt < 30 && current.state === FileState.PROCESSING; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    if (!current.name) break;
    current = await client.files.get({ name: current.name });
  }

  if (current.state === FileState.FAILED || !current.uri) {
    throw new Error('Gemini could not process the uploaded audio.');
  }
  return current;
}
export async function startAudioAnalysisWithGemini(
  filePath: string,
  mimeType: string,
  onStage?: (stage: GeminiAnalysisStage) => void,
): Promise<StartedGeminiAnalysis> {
  const environment = loadGeminiEnvironment();
  const client = new GoogleGenAI({ apiKey: environment.apiKey });
  let geminiFileName: string | undefined;

  try {
    onStage?.('gemini_upload_started');
    const uploaded = await uploadGeminiFile(client, filePath, mimeType, onStage);
    onStage?.('gemini_upload_completed');
    geminiFileName = uploaded.name;
    const active = await waitForActiveFile(client, uploaded);
    onStage?.('gemini_file_ready');
    onStage?.('gemini_generation_started');
    const interaction = await client.interactions.create({
      model: environment.model,
      input: [
        { type: 'audio', uri: active.uri, mime_type: active.mimeType ?? mimeType },
        { type: 'text', text: prompt },
      ],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: reportSchema,
      },
      generation_config: { max_output_tokens: 16_000 },
      background: GEMINI_REQUEST_FEATURES.background,
      store: GEMINI_REQUEST_FEATURES.store,
    }, { timeout: GEMINI_GENERATION_TIMEOUT_MS, maxRetries: 1 });
    if (!interaction.id || !geminiFileName) throw new Error('Gemini did not create an analysis job.');
    return { interactionId: interaction.id, geminiFileName };
  } catch (error) {
    if (geminiFileName) await client.files.delete({ name: geminiFileName }).catch(() => undefined);
    throw error;
  }
}

export async function getGeminiAnalysis(interactionId: string): Promise<GeminiJobResult> {
  const environment = loadGeminiEnvironment();
  const client = new GoogleGenAI({ apiKey: environment.apiKey });
  const interaction = await client.interactions.get(interactionId, null, {
    timeout: GEMINI_GENERATION_TIMEOUT_MS,
    maxRetries: 1,
  });
  if (interaction.status === 'queued' || interaction.status === 'in_progress') {
    return { status: 'processing' };
  }
  if (interaction.status !== 'completed' || !interaction.output_text) {
    return { status: 'failed' };
  }
  return { status: 'completed', report: parseGeminiReport(interaction.output_text) };
}

export async function deleteGeminiAnalysisFile(geminiFileName: string): Promise<void> {
  const environment = loadGeminiEnvironment();
  const client = new GoogleGenAI({ apiKey: environment.apiKey });
  await client.files.delete({ name: geminiFileName }).catch(() => undefined);
}
