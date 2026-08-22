import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeFetchHandler } from '../api/_lib/runtime-handler';

function typeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
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
