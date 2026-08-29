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

const GEMINI_UPLOAD_TIMEOUT_MS = 60_000;
const GEMINI_GENERATION_TIMEOUT_MS = 30_000;
const GEMINI_UPLOAD_RETRY_DELAYS_MS = [1_500, 4_000] as const;

export function geminiProviderStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) return null;
  const status = Number((error as { status?: unknown }).status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : null;
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
      background: true,
      store: true,
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
