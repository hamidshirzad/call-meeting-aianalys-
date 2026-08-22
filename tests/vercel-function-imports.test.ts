import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
});
