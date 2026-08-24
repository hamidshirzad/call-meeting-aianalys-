# Paid SaaS recovery checkpoint

This branch is the durable implementation branch for recovering the application into a production-ready paid SaaS.

## Guardrails

- Build from the current `main` branch.
- Keep Firebase Authentication and Firestore authoritative for identity, entitlements, usage, and reports.
- Keep Stripe Checkout, Customer Portal, and verified webhooks server-side.
- Keep Gemini credentials and calls server-side.
- Use Stripe test mode until the full Preview flow passes.
- Do not deploy to production, alter domains, delete Vercel projects, or use live credentials without explicit approval.
- Push implementation in small, reviewable commits.
- Keep this pull request in draft until tests, build verification, security review, and external test configuration are complete.

## Launch scope

Authentication, protected dashboard, secure audio analysis, report history, Free/Pro limits, Stripe Checkout, webhook-controlled entitlement, and Customer Portal.

Enterprise, team features, developer API keys, referrals, gamification, video generation, and live streaming remain deferred.

## Milestone status

- [x] Reproducible React/Vite dependency and test foundation
- [x] Firebase Authentication boundary (email/password, reset, optional Google, logout)
- [x] Remove shared demo identity and browser-authoritative plan state
- [x] Remove browser Gemini and mock Stripe services
- [x] Client-secret source/build guard
- [x] Default-deny Firestore rules and emulator configuration
- [x] Server-side Firebase Admin boundary and UID-scoped account profile repository
- [x] Stripe test-mode Checkout, Portal, signed webhooks, and entitlement repository
- [ ] Protected Gemini analysis and transactional usage
- [ ] Preview and end-to-end external-service verification

## Milestone 3 checkpoint

Stripe billing is implemented in test mode behind verified Firebase identity. The server owns the
Price, Customer mapping, Checkout and Portal sessions, webhook signature verification, event
deduplication, event ordering, subscription state, and entitlement decisions. A Checkout redirect
never grants Pro access; only a verified webhook can update the authoritative Firestore profile.

The product owner reports that the Belgian/EU tax treatment is confirmed. Automatic tax remains
intentionally disabled until that treatment is documented and the matching Stripe Tax head-office
details, active registrations, and product tax code are verified. No live Stripe key is accepted by
this milestone.
