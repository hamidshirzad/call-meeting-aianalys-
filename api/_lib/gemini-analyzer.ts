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
export async function analyzeAudioWithGemini(
  filePath: string,
  mimeType: string,
): Promise<GeneratedReport> {
  const environment = loadGeminiEnvironment();
  const client = new GoogleGenAI({ apiKey: environment.apiKey });
  let geminiFileName: string | undefined;

  try {
    const uploaded = await client.files.upload({
      file: filePath,
      config: { mimeType },
    });
    geminiFileName = uploaded.name;
    const active = await waitForActiveFile(client, uploaded);
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
    });

    if (!interaction.output_text) {
      throw new Error('Gemini returned no analysis.');
    }
    return parseGeminiReport(interaction.output_text);
  } finally {
    if (geminiFileName) {
      await client.files.delete({ name: geminiFileName }).catch(() => undefined);
    }
  }
}
