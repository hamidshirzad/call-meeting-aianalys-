import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = process.cwd();

const clientEntries = [
  'App.tsx',
  'index.tsx',
  'vite.config.ts',
  'auth',
  'components',
  'hooks',
  'lib',
  'services',
];

const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);

export const serverCredentialNames = [
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'FIREBASE_SERVICE_ACCOUNT',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
];

export const forbiddenBrowserAliases = serverCredentialNames.map((name) => `VITE_${name}`);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function accessPatterns(name) {
  const escaped = escapeRegExp(name);
  return [
    new RegExp(`process\\s*\\.\\s*env\\s*\\.\\s*${escaped}\\b`, 'g'),
    new RegExp(`process\\s*\\.\\s*env\\s*\\[\\s*(["'])${escaped}\\1\\s*\\]`, 'g'),
    new RegExp(`import\\s*\\.\\s*meta\\s*\\.\\s*env\\s*\\.\\s*${escaped}\\b`, 'g'),
    new RegExp(`import\\s*\\.\\s*meta\\s*\\.\\s*env\\s*\\[\\s*(["'])${escaped}\\1\\s*\\]`, 'g'),
  ];
}

export function findForbiddenClientSecretReferences(source) {
  const findings = [];

  for (const alias of forbiddenBrowserAliases) {
    if (new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(source)) {
      findings.push(`forbidden browser-visible alias ${alias}`);
    }
  }

  for (const name of [...serverCredentialNames, ...forbiddenBrowserAliases]) {
    if (accessPatterns(name).some((pattern) => pattern.test(source))) {
      findings.push(`client access to server credential ${name}`);
    }
  }

  const hardcodedSecretPatterns = [
    /\bsk_(?:live|test)_[A-Za-z0-9]{12,}\b/g,
    /\brk_(?:live|test)_[A-Za-z0-9]{12,}\b/g,
    /\bwhsec_[A-Za-z0-9]{12,}\b/g,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  ];

  if (hardcodedSecretPatterns.some((pattern) => pattern.test(source))) {
    findings.push('hardcoded secret-like value');
  }

  return [...new Set(findings)];
}

function collectSourceFiles(path) {
  const absolutePath = resolve(projectRoot, path);
  try {
    const stats = statSync(absolutePath);
    if (stats.isFile()) {
      return sourceExtensions.has(extname(absolutePath)) ? [absolutePath] : [];
    }

    return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === '__tests__' || entry.name === 'node_modules') {
        return [];
      }
      return collectSourceFiles(join(path, entry.name));
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export function scanClientSources() {
  return clientEntries.flatMap(collectSourceFiles).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return findForbiddenClientSecretReferences(source).map((finding) => ({
      file: relative(projectRoot, file),
      finding,
    }));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = scanClientSources();
  if (findings.length > 0) {
    console.error('Client secret guard failed:');
    for (const finding of findings) {
      console.error(`- ${finding.file}: ${finding.finding}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Client secret guard passed.');
  }
}
