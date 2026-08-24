import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BuildInfo from '../components/BuildInfo';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('build marker', () => {
  it('reports the commit the server is running', async () => {
    // The point of the component: without a visible commit, a fresh deploy and
    // a cached old one are indistinguishable in the browser.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ commit: 'abc1234', ref: 'codex/recover-paid-saas', environment: 'preview' }),
    ));

    render(<BuildInfo />);

    expect(await screen.findByTestId('build-commit')).toHaveTextContent('abc1234');
    expect(screen.getByText(/preview/)).toBeInTheDocument();
  });

  it('stays out of the way when the version endpoint is unreachable', async () => {
    // Deployment Protection and offline reloads both fail this request. A build
    // marker must never be the reason a dashboard renders broken.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const { container } = render(<BuildInfo />);

    await waitFor(() => expect(container.querySelector('.build-info')).toBeNull());
  });

  it('does not label a local build as a deployed environment', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ commit: 'dev', ref: null, environment: 'development' }),
    ));

    render(<BuildInfo />);

    expect(await screen.findByTestId('build-commit')).toHaveTextContent('dev');
    expect(screen.queryByText(/development/)).toBeNull();
  });
});
