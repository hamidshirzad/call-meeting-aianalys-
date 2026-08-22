# FourDoorAI Call Coach

This branch is recovering the original browser prototype into a server-authoritative paid SaaS.

Milestone 1 establishes a reproducible build, Firebase Authentication, a protected application boundary, strict client/server environment separation, and default-deny Firestore rules. AI analysis and billing are deliberately unavailable until their verified server-side milestones are implemented.

## Trust model

- Firebase Authentication is the only browser identity source.
- Authentication does **not** prove that a user has paid.
- The browser cannot assign a plan, entitlement, quota, or usage value.
- Firebase Admin, Gemini, Stripe secret keys, and webhook secrets remain server-only.
- Firestore rules deny browser writes to profiles, reports, usage, subscriptions, and Stripe event records.
- Local storage may be used only for harmless UI preferences.

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

The repository includes emulator ports in `firebase.json`. Full emulator-backed rules tests will be added with the server-side Firestore repository milestone; Milestone 1 includes deterministic rule-policy checks and a default-deny ruleset.

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

- Firestore profile/subscription repositories
- Stripe Checkout, Customer Portal, and verified webhooks
- Transactional usage enforcement
- Server-side Gemini analysis
- Saved report history and deletion
- Storage upload rules
- Account/data deletion
- Vercel Preview verification
- Belgian/EU VAT decision before live billing

Do not deploy to production or enable live Stripe credentials from this milestone.
