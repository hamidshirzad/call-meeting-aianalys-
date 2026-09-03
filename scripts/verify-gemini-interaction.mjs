/**
 * Finds out why Gemini rejects the analysis request with HTTP 400.
 *
 * Two finalized Safari recordings failed identically on Preview. Files upload
 * and activation both succeeded, then `interactions.create` returned 400 with
 * no field attribution, so the server-side classifier could not name a cause.
 *
 * Static analysis eliminated the obvious suspects: every field the server sends
 * matches the @google/genai type definitions for this endpoint. But types are
 * not the wire protocol, so this asks the real API.
 *
 * It sends the exact request the server sends, and if that fails, bisects it
 * one variable at a time. The first variant that succeeds names the cause.
 *
 * The raw provider error is printed to your terminal. That is the evidence we
 * need and it is not an application log, so the rule about keeping provider
 * details out of logs is unaffected. Nothing is uploaded except a generated
 * second of silence, and it is deleted afterwards.
 *
 * Usage:  GEMINI_API_KEY=... node scripts/verify-gemini-interaction.mjs
 *         GEMINI_API_KEY=... GEMINI_MODEL=gemini-2.5-flash node scripts/...
 */

import { GoogleGenAI, FileState } from '@google/genai';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey) {
  console.error('Set GEMINI_API_KEY first:');
  console.error('  GEMINI_API_KEY=... node scripts/verify-gemini-interaction.mjs');
  process.exit(1);
}

// Matches api/_lib/server-env.ts.
const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.7-flash';

// Copied verbatim from api/_lib/gemini-analyzer.ts so this tests what ships.
const reportSchema = {
  type: 'object',
  properties: {
    diarizedTranscript: {
      type: 'array',
      items: {
        type: 'object',
        properties: { speaker: { type: 'string' }, text: { type: 'string' } },
        required: ['speaker', 'text'],
      },
    },
    sentimentData: {
      type: 'array',
      items: {
        type: 'object',
        properties: { segmentIndex: { type: 'integer' }, score: { type: 'number' } },
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
};

/** The same schema with Gemini's uppercase Type enum, to test that hypothesis. */
function upperCaseTypes(node) {
  if (Array.isArray(node)) return node.map(upperCaseTypes);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [
    key,
    key === 'type' && typeof value === 'string' ? value.toUpperCase() : upperCaseTypes(value),
  ]));
}

const prompt = 'Summarize this audio in one short sentence.';

function silentWav(seconds = 1, sampleRate = 8_000) {
  const samples = seconds * sampleRate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

function describe(error) {
  const status = error?.status ?? '(none)';
  let detail = error?.message ?? String(error);
  try {
    // The SDK sets message to JSON.stringify of the whole provider body.
    detail = JSON.stringify(JSON.parse(detail), null, 2);
  } catch {
    // Not JSON; print as-is.
  }
  return `HTTP ${status}\n${detail}`;
}

const client = new GoogleGenAI({ apiKey });
let uploadedName;
let directory;

try {
  directory = await mkdtemp(join(tmpdir(), 'gemini-probe-'));
  const audioPath = join(directory, 'probe.wav');
  await writeFile(audioPath, silentWav());

  console.log(`\nModel under test: ${model}`);
  console.log('\n1. Uploading one second of silence to the Files API');
  let file = await client.files.upload({ file: audioPath, config: { mimeType: 'audio/wav' } });
  uploadedName = file.name;

  for (let attempt = 0; attempt < 30 && file.state === FileState.PROCESSING; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    file = await client.files.get({ name: uploadedName });
  }
  if (file.state === FileState.FAILED || !file.uri) {
    console.error(`  FAIL  file did not become ACTIVE (state ${file.state}).`);
    console.error('  The Files API itself is the problem, not the interaction.');
    process.exit(1);
  }
  console.log(`  file ready: ${file.name}  state: ${file.state}`);

  const audioPart = { type: 'audio', uri: file.uri, mime_type: file.mimeType ?? 'audio/wav' };
  const textPart = { type: 'text', text: prompt };
  const structured = {
    type: 'text',
    mime_type: 'application/json',
    schema: reportSchema,
  };

  // Ordered so the first success isolates exactly one variable from the one
  // before it. Baseline first: if it passes, the request is not the problem.
  const variants = [
    {
      name: 'baseline — exactly what the server sends today (no background)',
      verdict: 'The shipped request works. Any Preview failure is environmental or input-specific.',
      request: {
        model,
        input: [audioPart, textPart],
        response_format: structured,
        generation_config: { max_output_tokens: 16_000 },
        store: true,
      },
    },
    {
      name: 'without response_format, keeping store',
      verdict: 'CAUSE: structured output. response_format is rejected alongside store.',
      request: {
        model,
        input: [audioPart, textPart],
        generation_config: { max_output_tokens: 16_000 },
        store: true,
      },
    },
    {
      name: 'without response_format (no structured output)',
      verdict: 'CAUSE: structured output. response_format is rejected for this request.',
      request: {
        model,
        input: [audioPart, textPart],
        generation_config: { max_output_tokens: 16_000 },
        background: true,
        store: true,
      },
    },
    {
      name: 'response_format with UPPERCASE schema types',
      verdict: 'CAUSE: schema type case. Gemini wants OBJECT/ARRAY/STRING, not lowercase.',
      request: {
        model,
        input: [audioPart, textPart],
        response_format: { ...structured, schema: upperCaseTypes(reportSchema) },
        generation_config: { max_output_tokens: 16_000 },
        background: true,
        store: true,
      },
    },
    {
      name: 'text only, no audio part',
      verdict: 'CAUSE: the audio input part. Text-only works; audio does not.',
      request: {
        model,
        input: [textPart],
        response_format: structured,
        generation_config: { max_output_tokens: 16_000 },
        background: true,
        store: true,
      },
    },
    {
      name: 'minimal — model plus text, nothing optional',
      verdict: 'CAUSE: one of the optional fields. Minimal works; everything above does not.',
      request: { model, input: [textPart] },
    },
  ];

  // Regression guard for the known incompatibility, run regardless of outcome:
  // background mode was the original cause of the HTTP 400 and must stay out.
  console.log('\n2. Confirming background mode is still rejected (the original cause)');
  try {
    await client.interactions.create({
      model,
      input: [audioPart, textPart],
      generation_config: { max_output_tokens: 16_000 },
      background: true,
      store: true,
    }, { maxRetries: 0 });
    console.log('  NOTE: background was ACCEPTED. The provider may have fixed it —');
    console.log('  durable background execution could now be reinstated.');
  } catch (error) {
    console.log(`  still rejected, as expected (HTTP ${error?.status ?? '?'}). Keep it off.`);
  }

  console.log('\n3. Sending the shipped request, bisecting on failure\n');
  let baselineFailed = false;

  for (const [index, variant] of variants.entries()) {
    process.stdout.write(`  [${index + 1}/${variants.length}] ${variant.name} … `);
    try {
      const interaction = await client.interactions.create(variant.request, { maxRetries: 0 });
      console.log(`OK (id ${interaction.id ?? '(none)'}, status ${interaction.status ?? 'n/a'})`);

      if (index === 0) {
        console.log('\nBaseline succeeded — the request shape is not the cause.');
        console.log('Look at what differs in Preview: the model configured there, the account or');
        console.log('project the key belongs to, or something specific to the real recording.');
      } else {
        console.log(`\n${variant.verdict}`);
        console.log('Fix that one thing in api/_lib/gemini-analyzer.ts and re-run this script.');
      }
      break;
    } catch (error) {
      console.log('FAILED');
      if (index === 0) {
        baselineFailed = true;
        console.log('\n  --- provider error for the baseline request ---');
        console.log(describe(error).split('\n').map((line) => `  ${line}`).join('\n'));
        console.log('  ----------------------------------------------\n');
      }
      if (index === variants.length - 1) {
        console.log('\nEvery variant failed, including the minimal one.');
        console.log('That points away from the request body: check the API key, its project,');
        console.log('and whether the Interactions API is enabled for it.');
        console.log('\n  --- provider error for the minimal request ---');
        console.log(describe(error).split('\n').map((line) => `  ${line}`).join('\n'));
      }
    }
  }

  if (!baselineFailed) {
    console.log('\nNote: the baseline passed here, so this script could not reproduce the');
    console.log('Preview failure. That itself is a finding worth recording on PR #9.');
  }
  console.log('');
} finally {
  if (uploadedName) {
    await client.files.delete({ name: uploadedName }).catch(() => undefined);
    console.log(`Cleaned up ${uploadedName}`);
  }
  if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
}
