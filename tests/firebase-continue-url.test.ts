import { describe, expect, it, vi } from 'vitest';
import {
  prepareFirebaseContinueUrl,
  stripFragmentFromUrl,
} from '../auth/firebase-continue-url';

describe('Firebase OAuth continue URL', () => {
  it('removes an empty fragment before Firebase creates the OAuth request', () => {
    expect(stripFragmentFromUrl('https://preview.example/#')).toBe(
      'https://preview.example/',
    );
  });

  it('removes a non-empty fragment while preserving the path and query', () => {
    expect(stripFragmentFromUrl('https://preview.example/login?mode=google#account')).toBe(
      'https://preview.example/login?mode=google',
    );
  });

  it('leaves a fragment-free URL unchanged', () => {
    expect(stripFragmentFromUrl('https://preview.example/')).toBe(
      'https://preview.example/',
    );
  });

  it('replaces the browser URL only when a fragment is present', () => {
    const replaceState = vi.fn();
    const history = { replaceState, state: { preserved: true } };

    prepareFirebaseContinueUrl(
      { href: 'https://preview.example/#' },
      history,
    );

    expect(replaceState).toHaveBeenCalledWith(
      { preserved: true },
      '',
      'https://preview.example/',
    );

    replaceState.mockClear();
    prepareFirebaseContinueUrl(
      { href: 'https://preview.example/' },
      history,
    );
    expect(replaceState).not.toHaveBeenCalled();
  });
});
