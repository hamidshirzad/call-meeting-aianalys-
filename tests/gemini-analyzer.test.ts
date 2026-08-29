import { describe, expect, it } from 'vitest';
import {
  geminiProviderReason,
  geminiProviderStatus,
  parseGeminiReport,
} from '../api/_lib/gemini-analyzer';

describe('Gemini report boundary', () => {
  it('parses and bounds the structured report', () => {
    const report = parseGeminiReport(JSON.stringify({
      diarizedTranscript: [{ speaker: 'Agent', text: 'Hello' }],
      sentimentData: [{ segmentIndex: 0, score: 9 }],
      coachingCard: { strengths: ['Clear opening'], opportunities: ['Ask discovery questions'] },
      summary: 'A short call.',
    }));

    expect(report).toEqual({
      diarizedTranscript: [{ speaker: 'Agent', text: 'Hello' }],
      sentimentData: [{ segmentIndex: 0, score: 1 }],
      coachingCard: { strengths: ['Clear opening'], opportunities: ['Ask discovery questions'] },
      summary: 'A short call.',
    });
  });

  it('rejects malformed or incomplete model output', () => {
    expect(() => parseGeminiReport('{not-json')).toThrow();
    expect(() => parseGeminiReport(JSON.stringify({ summary: 'Missing transcript' }))).toThrow(
      /incomplete/i,
    );
  });

  it('extracts only a bounded provider HTTP status', () => {
    expect(geminiProviderStatus({ status: 429, message: 'private provider detail' })).toBe(429);
    expect(geminiProviderStatus({ status: '503' })).toBe(503);
    expect(geminiProviderStatus({ status: 200 })).toBeNull();
    expect(geminiProviderStatus(new Error('network failure'))).toBeNull();
  });

  it('reduces provider messages to fixed privacy-safe failure reasons', () => {
    expect(geminiProviderReason({ message: 'Unsupported codec in audio container user@example.com' }))
      .toBe('media_format');
    expect(geminiProviderReason({ message: 'response_schema is invalid: private detail' }))
      .toBe('response_schema');
    expect(geminiProviderReason({ message: 'background mode unavailable' }))
      .toBe('background_execution');
    expect(geminiProviderReason({ message: 'private unknown detail' })).toBe('unknown');
  });
});
