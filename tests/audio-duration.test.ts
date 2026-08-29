import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readAudioDurationSeconds } from '../api/analysis';

let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'duration-test-'));
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('server-side audio duration', () => {
  it('returns null instead of throwing when the container cannot be parsed', async () => {
    // Analysis writes the download to a temp path with no extension, so
    // music-metadata sniffs content and throws on anything unrecognized. That
    // must not fail an analysis Gemini could have handled — duration is only
    // display metadata, and validateAudioDuration(null) is a no-op.
    const path = join(directory, 'unparseable-audio');
    await writeFile(path, Buffer.from('not actually audio at all'));

    await expect(readAudioDurationSeconds(path)).resolves.toBeNull();
  });

  it('returns null for a missing file rather than propagating', async () => {
    await expect(readAudioDurationSeconds(join(directory, 'absent'))).resolves.toBeNull();
  });

  it('reads the duration of a parseable file', async () => {
    // A minimal 8 kHz mono WAV: 8000 samples of silence is exactly one second.
    const sampleRate = 8_000;
    const samples = sampleRate;
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

    const path = join(directory, 'one-second');
    await writeFile(path, buffer);

    await expect(readAudioDurationSeconds(path)).resolves.toBeCloseTo(1, 1);
  });
});
