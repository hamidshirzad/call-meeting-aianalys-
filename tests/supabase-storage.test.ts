import { describe, expect, it } from 'vitest';
import { createTemporaryUploadPath, safeTemporaryFileName } from '../api/_lib/supabase-storage';

describe('temporary Supabase upload paths', () => {
  it('creates a random path scoped to the verified Firebase UID', () => {
    expect(createTemporaryUploadPath('verified-uid', 'Discovery call.mp3')).toMatch(
      /^users\/verified-uid\/uploads\/[a-f0-9-]+-Discovery-call\.mp3$/,
    );
  });

  it('removes path separators and control characters', () => {
    expect(safeTemporaryFileName('../../private/call\u0000.mp3')).toBe('..-..-private-call-.mp3');
  });
});
