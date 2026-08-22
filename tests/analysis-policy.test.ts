import { describe, expect, it } from 'vitest';
import {
  MAX_AUDIO_BYTES,
  assertOwnedUploadPath,
  normalizeAudioType,
  validateAudioDuration,
  validateUploadMetadata,
} from '../api/_lib/analysis-policy';

describe('analysis upload policy', () => {
  it('accepts only a flat upload path under the verified UID', () => {
    expect(assertOwnedUploadPath('users/alice/uploads/1234-call.mp3', 'alice'))
      .toBe('users/alice/uploads/1234-call.mp3');
    expect(() => assertOwnedUploadPath('users/bob/uploads/1234-call.mp3', 'alice'))
      .toThrow(/does not belong/i);
    expect(() => assertOwnedUploadPath('users/alice/uploads/../secret', 'alice'))
      .toThrow(/does not belong/i);
  });

  it('enforces supported audio MIME types, size and duration', () => {
    expect(() => validateUploadMetadata(MAX_AUDIO_BYTES, 'audio/mpeg')).not.toThrow();
    expect(() => validateUploadMetadata(MAX_AUDIO_BYTES + 1, 'audio/mpeg')).toThrow(/50 MB/i);
    expect(() => validateUploadMetadata(1, 'text/plain')).toThrow(/supported audio/i);
    expect(() => validateAudioDuration(3_600)).not.toThrow();
    expect(() => validateAudioDuration(3_600.1)).toThrow(/60 minutes/i);
    expect(() => validateAudioDuration(null)).not.toThrow();
  });

  it('normalizes aliases before sending audio to Gemini', () => {
    expect(normalizeAudioType('audio/x-wav')).toBe('audio/wav');
    expect(normalizeAudioType('audio/mp4; codecs=aac')).toBe('audio/m4a');
  });
});
