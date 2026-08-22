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
