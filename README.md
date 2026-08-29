# FourDoorAI Call Coach

The original browser prototype has been recovered into a server-authoritative paid SaaS foundation.
The implemented launch path includes authentication, transactional Free and Pro usage enforcement,
server-only Gemini analysis, saved report history, and server-authorized report deletion. Stripe
remains the only subscription authority.

## Current trust model

- Firebase Authentication is the only browser identity source.
- Authentication does **not** prove that a user has paid.
- Firebase Admin verifies the ID token for every account, Checkout, and Portal request.
- The browser cannot choose a UID, Stripe Customer, Subscription, Price, plan, or entitlement.
- The Pro Price is allowlisted through a server-only environment variable.
- Checkout success and cancel URLs are display signals only; neither can change access.
- Stripe webhook signatures are verified from the exact raw request body before processing.
- Firestore stores processed Stripe event IDs so webhook retries are idempotent.
- Older subscription events cannot overwrite newer subscription state.
- Firestore rules deny browser writes to profiles, reports, usage, subscriptions, and Stripe events.
- Firebase Admin, Gemini, Stripe keys, and webhook secrets remain server-only.
- Audio uploads use a short-lived Supabase signed token and a private `call-uploads` bucket. The
  Supabase secret and Gemini key never reach the browser.
- Analysis verifies the Firebase token, accepts only the caller's UID-scoped object path, and
  validates the stored object's actual type, size, and duration before processing.
- Free and Pro plans receive 5 and 50 completed analyses per UTC month. Transactional reservations
  prevent concurrent requests from exceeding those limits.
- Failed processing releases its reservation. Only a report saved in the same transaction consumes
  usage.
- Supabase, Vercel `/tmp`, and Gemini temporary copies are deleted on every exit path.
- New server-created profiles always start on `free`, with `subscriptionStatus: none` and
  `entitled: false`.

## Implemented launch path

1. A user registers or signs in with Firebase Authentication.
2. `GET /api/account` verifies the Firebase ID token and returns the authoritative profile.
3. A Free user requests `POST /api/billing/checkout` with no client-selected billing values.
4. The server creates or reuses the UID-linked Stripe Customer and opens hosted Checkout using the
   allowlisted monthly Pro Price.
5. Stripe sends a signed event to `POST /api/stripe/webhook`.
6. The webhook transaction deduplicates the event, rejects stale state, and updates Firestore.
7. The browser refreshes the account profile and displays the webhook-derived plan.
8. A user with a Stripe Customer can open `POST /api/billing/portal` to manage billing.
9. `POST /api/uploads` verifies the token, validates declared metadata, and returns a short-lived
    signed permission for a private UID-scoped Supabase object.
10. The browser uploads in retryable 6 MB chunks, then `POST /api/analysis` verifies the object,
    reserves usage, downloads it server-side, and sends it to Gemini.
11. Successful analysis saves the report and completes usage atomically; failure releases usage.
12. `GET /api/reports` returns owner history and current usage. `DELETE /api/reports` deletes only a
    report beneath the verified UID.

## Local setup

1. Install the committed dependency graph with `npm ci`.
2. Copy `.env.example` to `.env.local`.
3. Fill in the five browser-safe `VITE_FIREBASE_*` web-app settings.
4. Supply separate test server credentials in the local function runtime.
5. Run `npm run dev`.

Without Firebase web configuration, the application renders a configuration error and never falls
back to a shared demo user. Without the server-only Firebase or Stripe settings, protected API
routes return a bounded configuration error rather than leaking missing names or secret values.

## Environment boundary

Browser-safe Firebase identifiers:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Server-only Firebase Admin values:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (escaped `\\n` newlines are normalized server-side)

Server-only Stripe test values:

- `STRIPE_SECRET_KEY`: a test secret key or least-privileged test restricted key
- `STRIPE_WEBHOOK_SECRET`: the signing secret for this environment's webhook endpoint
- `STRIPE_PRO_MONTHLY_PRICE_ID`: the one allowlisted recurring Pro Price
- `APP_URL`: the exact HTTPS origin for this environment, with no path

Server-only AI values:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional; defaults to `gemini-3.7-flash`)

Never add `VITE_` to a Gemini key, Stripe secret, webhook secret, Firebase Admin credential, or any
equivalent alias. Preview and Production must use separate scoped values. `APP_URL` must point to the
same environment that initiated Checkout; configure a stable Preview branch URL if ephemeral Vercel
deployment hosts would otherwise change on every build.

## Billing endpoints

All browser billing endpoints require:

```http
Authorization: Bearer <firebase-id-token>
```

### `POST /api/billing/checkout`

- Accepts no browser-selected Price, Customer, Subscription, UID, or plan.
- Creates a Stripe Customer with an idempotency key derived from the verified UID when needed.
- Transactionally reuses the winning Customer if concurrent requests race.
- Uses hosted subscription Checkout and Stripe's dynamic payment methods.
- Uses only `STRIPE_PRO_MONTHLY_PRICE_ID` for the Pro line item.
- Blocks a second Checkout while an existing subscription needs Portal management.
- Returns a short-lived HTTPS Checkout URL.

### `POST /api/billing/portal`

- Opens a short-lived Stripe Customer Portal session for the verified user's mapped Customer.
- Never accepts a Customer ID from the browser.
- Returns to the environment-specific `APP_URL`.

### `POST /api/stripe/webhook`

- Requires `Stripe-Signature` and verifies it with `STRIPE_WEBHOOK_SECRET`.
- Reads the exact raw body before parsing or processing.
- Rejects live-mode events in this milestone.
- Returns `200` for unsupported event types so Stripe does not retry irrelevant events.
- Stores event outcomes in `stripeEvents/{eventId}` and updates the user in one transaction.

Subscribe the test endpoint to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`
- `invoice.paid`
- `invoice.payment_failed`

`checkout.session.completed` associates known Stripe identifiers but does not itself grant access.
Subscription state is reconciled from the current Stripe Subscription before Firestore is updated.

## Entitlement policy

| Stripe-derived status | Plan | Access |
|---|---:|---|
| `active` or `trialing` | Pro | Granted |
| `past_due` for up to seven days | Pro | Temporarily granted with a warning |
| `past_due` after seven days | Pro | Denied |
| `unpaid`, `canceled`, `incomplete`, `incomplete_expired`, or `paused` | Free | Denied |
| `none` or any unknown value | Free | Denied |

The account read recalculates grace access from `pastDueSince`; it does not trust a stale stored
boolean. Unknown statuses and Prices fail closed.

## Stripe test-mode preparation

No Stripe account was modified by this branch. When external Preview setup is approved:

1. In Stripe test mode, create or select the FourDoorAI Pro product.
2. Create one recurring monthly EUR Price for €49 and put only its ID in
   `STRIPE_PRO_MONTHLY_PRICE_ID`.
3. Configure the test Customer Portal for subscription management and cancellation.
4. Create a test webhook for `https://<preview-host>/api/stripe/webhook` with the event list above.
5. Store its test signing secret only as `STRIPE_WEBHOOK_SECRET` in the matching Preview scope.
6. Store a test secret or minimum-permission restricted key only as `STRIPE_SECRET_KEY`.
7. Set `APP_URL` to the exact Preview origin and redeploy that Preview.
8. Complete a test Checkout, confirm the webhook succeeds, refresh billing status, open Portal,
   cancel the test subscription, and confirm the UI returns to Free from the webhook update.

Do not paste Stripe secrets into chat, commit them, reuse Preview values in Production, or use a
live-mode key. The server rejects `sk_live_` and live webhook events in this milestone.

## Firebase preparation

No Firebase project was created or modified by this branch.

Before exposing a Preview:

1. Use the intended dedicated Firebase project.
2. Enable Email/Password Authentication and optionally Google Authentication.
3. Add the stable Preview and canonical Vercel hosts to Firebase Authorized domains.
4. Create Firestore and deploy `firestore.rules` before allowing users into the application.
   Firebase Cloud Storage is not used; temporary audio uses the private Supabase bucket.
5. Configure a dedicated, least-privileged Firebase Admin service account only in the server
   environment.

The repository includes Firestore emulator ports in `firebase.json`. `npm run test:rules` proves
owner-only reads and browser-write denial for profiles, reports, usage, and Stripe event records
when the emulator binary is available.

## Analysis endpoints

All analysis and report endpoints require a Firebase ID token in the `Authorization` header. They
ignore browser plan claims and reject browser-supplied UIDs.

### `POST /api/uploads`

Accepts `{ "fileName", "size", "contentType" }`. It returns a short-lived signed upload token and a
random path beneath `users/<verified UID>/uploads/`. The browser uses the TUS resumable protocol,
so files bypass Vercel's request-body limit without receiving any server credential.

### `POST /api/analysis`

Accepts `{ "storagePath", "originalName" }`. The path must belong to the verified UID. The server
reads authoritative object metadata, measures duration, reserves quota transactionally, and sends
the local temporary copy to Gemini. Failed work releases quota; every temporary copy is deleted.
Raw audio, transcripts, keys, and model output are never logged.

### `GET /api/reports`

Returns up to 30 newest reports for the verified UID plus the current UTC-month usage summary.

### `DELETE /api/reports`

Accepts only `{ "reportId": "..." }` and deletes that document under the verified UID. Deleting a
report does not refund already completed monthly usage.

## Verification

```bash
npm run guard:client-secrets
npm run typecheck
npm test
npm run build
npm run check
npm run test:rules
```

The client-secret guard scans browser-accessible source and rejects known server credential names
through dot or bracket access on `process.env` and `import.meta.env`, forbidden `VITE_` secret
aliases, and hardcoded Stripe/webhook/private-key patterns.

The unit suite covers Firebase authorization, browser impersonation attempts, the server
Price allowlist, Customer reuse, Checkout and Portal boundaries, raw-body signature verification,
event deduplication, stale-event rejection, cancellation and payment-failure state, seven-day
`past_due` grace, fail-closed statuses, UID-scoped upload paths, MIME/size/duration policy,
concurrent Free/Pro reservations, failure release, completed-only charging, report ownership,
Gemini response validation, temporary cleanup, and the upload/history dashboard.

`vercel.json` requests a 300-second maximum for the analysis function. The actual maximum still
depends on the selected Vercel plan. Measure representative 50 MB/60-minute calls in Preview; if
they exceed the available synchronous duration, move analysis to a durable asynchronous worker
before Production rather than silently lowering security or reliability.

## Tax and live-mode blocker

Stripe Tax is intentionally **not enabled**. No automatic tax will be calculated or collected by
this code. The product owner reports that the Belgian/EU tax treatment is confirmed. Before live
billing, record that treatment in the launch checklist, verify the Stripe Tax head-office details,
active registrations, and selected SaaS product tax code, then test the resulting calculation.
Adding a registration in Stripe records an existing registration; it does not register the business
with a tax authority.

Do not turn on `automatic_tax` merely because a Stripe account exists. It can silently collect zero
tax without active registrations, and it must not be enabled until the legal and Stripe setup is
confirmed.

## Deferred work

- Full re-authenticated account/data deletion
- Vercel Preview end-to-end verification
- Documented Belgian/EU VAT treatment and validated Stripe Tax setup before live billing
- Production credentials, production deployment, and domain changes

Enterprise, teams, developer API keys, referrals, gamification, video generation, and Gemini Live
streaming remain outside the launch recovery scope.
