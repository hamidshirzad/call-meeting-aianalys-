import { describe, expect, it } from 'vitest';
import { geminiProviderDiagnostic } from '../api/_lib/gemini-analyzer';

/**
 * The SDK builds ApiError.message as JSON.stringify of the whole provider error
 * body, so these fixtures mirror what actually reaches the classifier.
 */
function providerError(body: Record<string, unknown>, status = 400) {
  const error = new Error(JSON.stringify({ error: body }));
  Object.assign(error, { status, name: 'ApiError' });
  return error;
}

function fieldViolation(field: string, description = 'Invalid value.') {
  return {
    code: 400,
    status: 'INVALID_ARGUMENT',
    message: 'Request contains an invalid argument.',
    details: [{
      '@type': 'type.googleapis.com/google.rpc.BadRequest',
      fieldViolations: [{ field, description }],
    }],
  };
}

describe('Gemini provider failure classification', () => {
  it('names the rejected field instead of guessing from prose', () => {
    // The real Preview failures classified as "unknown" because the provider
    // message is a structured field violation, not descriptive text. The field
    // path is the evidence that was being discarded.
    const diagnostic = geminiProviderDiagnostic(
      providerError(fieldViolation('response_format.schema.type')),
    );

    expect(diagnostic).toEqual({
      reason: 'response_schema',
      canonicalStatus: 'INVALID_ARGUMENT',
      fieldPath: 'response_format',
    });
  });

  it('distinguishes each rejected request field', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['response_format.schema.properties', 'response_schema'],
      ['generation_config.max_output_tokens', 'request_shape'],
      ['background', 'background_execution'],
      ['store', 'background_execution'],
      ['model', 'model_capability'],
      ['input[0].mime_type', 'media_format'],
      ['input[0].uri', 'file_reference'],
      ['input', 'request_shape'],
      ['system_instruction', 'request_shape'],
    ];

    for (const [field, expected] of cases) {
      expect(geminiProviderDiagnostic(providerError(fieldViolation(field))).reason)
        .toBe(expected);
    }
  });

  it('reads field names reported only in the message text', () => {
    // "Unknown name" errors carry no fieldViolations array.
    expect(geminiProviderDiagnostic(providerError({
      code: 400,
      status: 'INVALID_ARGUMENT',
      message: 'Invalid JSON payload received. Unknown name "background": Cannot find field.',
    }))).toMatchObject({ reason: 'background_execution', fieldPath: 'background' });

    expect(geminiProviderDiagnostic(providerError({
      code: 400,
      status: 'INVALID_ARGUMENT',
      message: "Invalid value at 'response_format.schema.type' (TYPE_ENUM), \"object\"",
    }))).toMatchObject({ reason: 'response_schema', fieldPath: 'response_format' });
  });

  it('falls back to unknown rather than inventing a category', () => {
    // An unrecognised field must never be recorded or guessed at.
    const diagnostic = geminiProviderDiagnostic(providerError({
      code: 400,
      status: 'INVALID_ARGUMENT',
      message: 'Request contains an invalid argument.',
      details: [{
        '@type': 'type.googleapis.com/google.rpc.BadRequest',
        fieldViolations: [{ field: 'some_future_field.nested', description: 'nope' }],
      }],
    }));

    expect(diagnostic.reason).toBe('unknown');
    expect(diagnostic.fieldPath).toBeNull();
    expect(diagnostic.canonicalStatus).toBe('INVALID_ARGUMENT');
  });

  it('refuses a canonical status it does not recognise', () => {
    expect(geminiProviderDiagnostic(providerError({
      code: 400,
      status: 'SOMETHING_INVENTED',
      message: 'Request contains an invalid argument.',
    })).canonicalStatus).toBeNull();
  });

  it('still classifies provider errors that carry no field reference', () => {
    // Older prose-only errors must keep working.
    expect(geminiProviderDiagnostic({ message: 'Unsupported codec in audio container' }).reason)
      .toBe('media_format');
    expect(geminiProviderDiagnostic(new Error('network failure')).reason).toBe('unknown');
    expect(geminiProviderDiagnostic(undefined).reason).toBe('unknown');
    expect(geminiProviderDiagnostic({ message: '{not valid json' }).reason).toBe('unknown');
  });
});
