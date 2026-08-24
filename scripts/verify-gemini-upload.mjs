/**
 * Proves the browser-direct upload path before trusting it in production.
 *
 * The analysis flow mints a resumable upload URL server-side, then has the
 * browser PUT audio bytes straight to Google. That skips Vercel's 4.5 MB
 * request body cap, which is the only reason a storage bucket was ever needed.
 *
 * Two assumptions have to hold, and this script checks both:
 *   1. A resumable start returns an upload URL in the x-goog-upload-url header.
 *   2. That URL accepts the bytes WITHOUT the API key, so a browser can use it.
 *
 * Usage:  GEMINI_API_KEY=... node scripts/verify-gemini-upload.mjs
 */

const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey) {
  console.error('Set GEMINI_API_KEY first:  GEMINI_API_KEY=... node scripts/verify-gemini-upload.mjs');
  process.exit(1);
}

const uploadEndpoint = 'https://generativelanguage.googleapis.com/upload/v1beta/files';
const filesEndpoint = 'https://generativelanguage.googleapis.com/v1beta';

// A minimal silent WAV so the run costs nothing and needs no fixture on disk.
function silentWav(seconds = 1, sampleRate = 8_000) {
  const samples = seconds * sampleRate;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

const audio = silentWav();
const nonce = `verify-${crypto.randomUUID()}`;
let uploadedName = null;

function pass(message) {
  console.log(`  PASS  ${message}`);
}

try {
  // ---- Step 1: mint the upload URL (server-side, holds the API key) --------
  console.log('\n1. Minting a resumable upload URL (server-side, with API key)');
  const start = await fetch(uploadEndpoint, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(audio.byteLength),
      'X-Goog-Upload-Header-Content-Type': 'audio/wav',
      'Content-Type': 'application/json',
    },
    // display_name carries the nonce that later proves file ownership.
    body: JSON.stringify({ file: { display_name: nonce } }),
  });

  if (!start.ok) {
    console.error(`  FAIL  start returned ${start.status}\n${await start.text()}`);
    process.exit(1);
  }

  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    console.error('  FAIL  no x-goog-upload-url header. Headers seen:');
    console.error(`        ${[...start.headers.keys()].join(', ')}`);
    process.exit(1);
  }
  pass(`upload URL minted (${uploadUrl.slice(0, 60)}…)`);

  // ---- Step 2: upload the bytes WITHOUT the key (the browser's leg) --------
  // No x-goog-api-key here on purpose. If this succeeds, a browser can do it.
  console.log('\n2. Uploading bytes with NO API key (simulating the browser)');
  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
      'Content-Type': 'audio/wav',
    },
    body: audio,
  });

  if (!upload.ok) {
    console.error(`  FAIL  upload returned ${upload.status}\n${await upload.text()}`);
    console.error('\n  The upload URL requires credentials, so a browser cannot use it.');
    console.error('  Fall back to direct multipart upload capped at 4 MB.');
    process.exit(1);
  }

  const { file } = await upload.json();
  uploadedName = file?.name ?? null;
  pass(`unauthenticated upload accepted — browser-direct upload works`);
  pass(`file: ${file?.name}  state: ${file?.state}  size: ${file?.sizeBytes} bytes`);

  // ---- Step 3: confirm the nonce survives, so ownership is provable -------
  console.log('\n3. Confirming display_name round-trips as the ownership nonce');
  if (file?.displayName !== nonce) {
    console.error(`  FAIL  displayName was "${file?.displayName}", expected "${nonce}"`);
    console.error('  Without this the server cannot prove which user owns a file.');
    process.exit(1);
  }
  pass('displayName matches the nonce — server can verify file ownership');

  // sizeBytes is what keeps the 50 MB cap server-authoritative once the
  // server no longer sees the bytes, so it must be present and truthful.
  if (Number(file?.sizeBytes) !== audio.byteLength) {
    console.error(`  FAIL  sizeBytes was ${file?.sizeBytes}, expected ${audio.byteLength}`);
    process.exit(1);
  }
  pass('sizeBytes is accurate — the size cap stays server-enforceable');

  console.log('\nAll three assumptions hold. The storage bucket is not needed.\n');
} finally {
  // Never leave test files behind in the project's Gemini file store.
  if (uploadedName) {
    await fetch(`${filesEndpoint}/${uploadedName}`, {
      method: 'DELETE',
      headers: { 'x-goog-api-key': apiKey },
    }).catch(() => undefined);
    console.log(`Cleaned up ${uploadedName}`);
  }
}
