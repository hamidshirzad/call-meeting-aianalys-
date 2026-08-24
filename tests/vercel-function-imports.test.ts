import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeFetchHandler } from '../api/_lib/runtime-handler';

function typeScriptFiles(directory: string, extensions = ['.ts']): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typeScriptFiles(path, extensions);
    return entry.isFile() && extensions.some((suffix) => entry.name.endsWith(suffix))
      ? [path]
      : [];
  });
}

describe('Vercel Node function module graph', () => {
  it('uses resolvable .js extensions for every relative server import', () => {
    const failures: string[] = [];

    for (const file of typeScriptFiles(resolve('api'))) {
      const source = readFileSync(file, 'utf8');
      const relativeImport = /\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g;

      for (const match of source.matchAll(relativeImport)) {
        const specifier = match[1];
        if (!specifier.endsWith('.js')) {
          failures.push(`${file}: ${specifier} is extensionless`);
          continue;
        }

        const sourceTarget = resolve(dirname(file), specifier.replace(/\.js$/, '.ts'));
        if (!existsSync(sourceTarget)) {
          failures.push(`${file}: ${specifier} has no TypeScript source target`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('routes every API path the browser calls to a real function file', () => {
    // Vercel maps files to routes literally, so api/analysis-upload-url.ts
    // serves /api/analysis-upload-url and never /api/analysis/upload-url.
    // Handler tests call functions directly and cannot catch that mismatch;
    // it would only appear as a 404 in production.
    const clientSources = ['lib', 'components', 'auth']
      .filter((directory) => existsSync(resolve(directory)))
      .flatMap((directory) => typeScriptFiles(resolve(directory), ['.ts', '.tsx']));

    const missing: string[] = [];

    for (const file of clientSources) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/['"](\/api\/[a-z0-9/-]+)['"]/gi)) {
        const route = match[1].replace(/^\/api\//, '');
        if (!existsSync(resolve('api', `${route}.ts`))) {
          missing.push(`${file}: ${match[1]} has no api/${route}.ts`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('does not pass Vercel runtime context into test dependency slots', async () => {
    const handler = vi.fn(async (_request: Request, dependencies = 'default-dependencies') =>
      new Response(dependencies),
    );
    const runtimeFetch = createRuntimeFetchHandler(handler);
    const request = new Request('https://example.test/api/account');

    const response = await (runtimeFetch as unknown as (
      request: Request,
      context: unknown,
    ) => Promise<Response>)(request, { waitUntil: vi.fn() });

    await expect(response.text()).resolves.toBe('default-dependencies');
    expect(handler).toHaveBeenCalledWith(request);
  });
});
