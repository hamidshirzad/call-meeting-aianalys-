# FourDoorAI Call Coach

This branch is recovering the original browser prototype into a server-authoritative paid SaaS.

Milestone 2 adds the server identity foundation: Firebase Admin ID-token verification, a UID-scoped Firestore account repository, request-correlated API errors, and emulator-backed security-rule tests. AI analysis and billing remain deliberately unavailable until their own verified server-side milestones are implemented.

## Trust model

- Firebase Authentication is the only browser identity source.
- Authentication does **not** prove that a user has paid.
- The browser cannot assign a plan, entitlement, quota, or usage value.
- Firebase Admin, Gemini, Stripe secret keys, and webhook secrets remain server-only.
- Firestore rules deny browser writes to profiles, reports, usage, subscriptions, and Stripe event records.
- Local storage may be used only for harmless UI preferences.
- `GET /api/account` derives its UID exclusively from a verified Firebase ID token.
- New server-created profiles always start on `free`, with `subscriptionStatus: none` and `entitled: false`.

## Local setup

1. Install dependencies with `npm ci` after the lockfile is committed.
2. Copy `.env.example` to `.env.local`.
3. Fill in only the six browser-safe `VITE_FIREBASE_*` web-app settings.
4. Run `npm run dev`.

Without Firebase web configuration, the application renders a configuration error and keeps authentication controls disabled. It never falls back to a shared demo user.

## Checks

```bash
npm run guard:client-secrets
npm run typecheck
npm test
npm run build
npm run check
npm run test:rules
```

The client-secret guard scans browser-accessible source and rejects known server credential names through dot or bracket access on both `process.env` and `import.meta.env`, forbidden `VITE_` secret aliases, and hardcoded Stripe/webhook/private-key patterns.

## Firebase preparation

No external Firebase project is created or modified by this branch.

Before a Preview is exposed:

1. Create or select a dedicated Firebase project.
2. Enable Email/Password Authentication.
3. Optionally enable Google Authentication.
4. Add the Preview and canonical Vercel hosts to Authorized domains.
5. Deploy `firestore.rules` before allowing users into the application.
6. Use separate, least-privileged Firebase Admin credentials only in server environments during a later milestone.

The repository includes emulator ports in `firebase.json`. `npm run test:rules` starts the Firestore emulator and proves owner-only reads plus browser-write denial for profiles, reports, usage, and Stripe event records.

## Server account endpoint

`GET /api/account` requires a Firebase ID token:

```http
Authorization: Bearer <firebase-id-token>
```

The function verifies revocation through Firebase Admin, ignores all browser identity state, rejects `uid` and `userId` query parameters, and creates or reads only `users/{verifiedUid}`. It may synchronize verified email/name fields, but it never overwrites plan, entitlement, or Stripe identifiers while doing so.

The endpoint returns bounded errors:

- `401` for missing or invalid Firebase tokens
- `400` for client UID impersonation attempts
- `405` for unsupported methods
- `503` when server-only Firebase Admin configuration is absent
- `500` for unexpected failures, with a request ID and no internal error details

Required server-only Firebase Admin variables:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (escaped `\\n` newlines are normalized server-side)

These credentials are not needed by the Vite browser build and must never receive a `VITE_` prefix.

## Environment boundary

Browser-safe variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Everything else is server-only. In particular, never create `VITE_GEMINI_API_KEY`, `VITE_STRIPE_SECRET_KEY`, `VITE_STRIPE_WEBHOOK_SECRET`, or equivalent aliases.

## Deferred work

- Stripe Checkout, Customer Portal, and verified webhooks
- Transactional usage enforcement
- Server-side Gemini analysis
- Saved report history and deletion
- Storage upload rules
- Account/data deletion
- Vercel Preview verification
- Belgian/EU VAT decision before live billing

Do not deploy to production or enable live Stripe credentials from this milestone.
