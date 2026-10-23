# Proof fork status

Evidence reviewed: 2026-10-23, source baseline `9c7e7bc`.
Source inspection establishes integrated code; it does not establish a
public release, hosted deployment, or a fresh runtime test result.

## Integrated source

- The Conquistador review integration is merged (`f0ce697`, 2026-10-03):
  channel previews, playbook/findings display, and human browser approval
  stamps described in [docs/conquistador-review.md](docs/conquistador-review.md).
- [server/conquistador-review.ts](server/conquistador-review.ts) and
  [server/index.ts](server/index.ts) contain the fork routes and loopback
  binding. Upstream attribution is present in [NOTICE](NOTICE).
- The paste-mark range clamp is integrated at `3262469` / merge `0b7938a`
  (2026-10-06). SDK packages, SQLite persistence, collaboration, agent
  bridge, and example code are present in the tracked tree.

## Shipped / in progress

No verified public release or hosted deployment is recorded for this
checkout. No separate active feature branch is established by this review.
[package.json](package.json) declares `proof-sdk` `0.1.0`; a manifest version
alone is not evidence of publication.

## Planned and next steps

1. Select a concrete fork change or upstream integration before extending
   features. Preserve MIT attribution and review/publication boundaries.
2. Use [README.md](README.md) for local setup, then run the configured
   `npm test` and `npm run build` gates when validating executable changes.
3. Recheck review-stamp invalidation and local bridge behavior for the exact
   candidate revision before claiming a tested delivery.

## Blockers and not built

Delivery state remains unverified; this pass did not install dependencies
or start the editor/server. No FORSVN hosted service is established.
Approval stamps do not implement publication authorization. External
resources and review captures resolve through [BRAIN.md](BRAIN.md).
