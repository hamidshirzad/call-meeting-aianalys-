import { describe, expect, it } from 'vitest';
import {
  MAX_AUDIO_BYTES,
  assertGeminiFileName,
  assertUploadMatchesReservation,
  normalizeAudioType,
  readReportedDuration,
  validateAudioDuration,
  validateUploadMetadata,
} from '../api/_lib/analysis-policy';

const reservation = { geminiNonce: 'secret-nonce', declaredSize: 1_024 };

describe('analysis upload policy', () => {
  it('accepts only well-formed Gemini file names', () => {
    expect(assertGeminiFileName('files/abc123')).toBe('files/abc123');
    expect(() => assertGeminiFileName('users/alice/uploads/call.mp3')).toThrow(/audio file/i);
    expect(() => assertGeminiFileName('files/../secret')).toThrow(/audio file/i);
    expect(() => assertGeminiFileName(undefined)).toThrow(/audio file/i);
  });

  it('rejects a file whose nonce does not match the reservation', () => {
    // The nonce is the whole ownership guarantee. Gemini file names are
    // project-wide, so without this a client could name another user's file.
    expect(() =>
      assertUploadMatchesReservation(
        { displayName: 'someone-elses-nonce', sizeBytes: 512 },
        reservation,
      ),
    ).toThrow(/does not belong/i);

    expect(() =>
      assertUploadMatchesReservation({ displayName: null, sizeBytes: 512 }, reservation),
    ).toThrow(/does not belong/i);
  });

  it('refuses to trust a reservation that carries no nonce', () => {
    // A reservation written before the nonce existed must fail closed rather
    // than match a file that also reports no display name.
    expect(() =>
      assertUploadMatchesReservation(
        { displayName: null, sizeBytes: 512 },
        { geminiNonce: '', declaredSize: 1_024 },
      ),
    ).toThrow(/does not belong/i);
  });

  it('enforces the size cap against what Gemini actually received', () => {
    // The server never sees the bytes now, so the size it verifies here is the
    // only real limit; the client's declared size alone cannot be trusted.
    expect(() =>
      assertUploadMatchesReservation({ displayName: 'secret-nonce', sizeBytes: 1_024 }, reservation),
    ).not.toThrow();

    expect(() =>
      assertUploadMatchesReservation({ displayName: 'secret-nonce', sizeBytes: 2_048 }, reservation),
    ).toThrow(/50 MB/i);

    expect(() =>
      assertUploadMatchesReservation(
        { displayName: 'secret-nonce', sizeBytes: MAX_AUDIO_BYTES + 1 },
        { geminiNonce: 'secret-nonce', declaredSize: MAX_AUDIO_BYTES + 1 },
      ),
    ).toThrow(/50 MB/i);

    expect(() =>
      assertUploadMatchesReservation({ displayName: 'secret-nonce', sizeBytes: 0 }, reservation),
    ).toThrow(/supported audio/i);
  });

  it('enforces supported audio MIME types and size when authorizing an upload', () => {
    expect(() => validateUploadMetadata(MAX_AUDIO_BYTES, 'audio/mpeg')).not.toThrow();
    expect(() => validateUploadMetadata(MAX_AUDIO_BYTES + 1, 'audio/mpeg')).toThrow(/50 MB/i);
    expect(() => validateUploadMetadata(1, 'text/plain')).toThrow(/supported audio/i);
  });

  it('bounds the duration the browser reports instead of trusting it', () => {
    // Advisory only — display metadata the server cannot measure itself.
    expect(readReportedDuration(120)).toBe(120);
    expect(readReportedDuration(999_999)).toBe(3_600);
    expect(readReportedDuration(0)).toBeNull();
    expect(readReportedDuration(-5)).toBeNull();
    expect(readReportedDuration('an hour')).toBeNull();
    expect(readReportedDuration(undefined)).toBeNull();
    expect(readReportedDuration(Number.NaN)).toBeNull();
    expect(() => validateAudioDuration(3_600)).not.toThrow();
  });

  it('normalizes aliases before sending audio to Gemini', () => {
    expect(normalizeAudioType('audio/x-wav')).toBe('audio/wav');
    expect(normalizeAudioType('audio/mp4; codecs=aac')).toBe('audio/m4a');
  });
});
