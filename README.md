# Proof SDK (FORSVN fork)

Local document editor and agent bridge with the
[Conquistador review panel](docs/conquistador-review.md), forked from
[Proof SDK](https://github.com/EveryInc/proof-sdk).

- [VISION.md](VISION.md): users, intended outcomes, and fork boundaries.
- [BRAIN.md](BRAIN.md): external knowledge key and authorized Drive access.
- [STRUCTURE.md](STRUCTURE.md): packages, data flow, and repository map.
- [STATUS.md](STATUS.md): dated state, blockers, and next steps.

## Run

Use Node 22+ and npm (the locked SQLite native dependency excludes Node 18).

```bash
npm ci
npm run dev
# In another terminal:
npm run serve
```

Editor: `http://localhost:3000`; API: `http://127.0.0.1:4000`.
Run `npm test` and `npm run build` for the configured checks. Build output
goes to `dist/`, including `web-artifact-manifest.json`.

[AGENT_CONTRACT.md](AGENT_CONTRACT.md) and [agent docs](docs/agent-docs.md)
describe the HTTP surface; [CHANGELOG.md](CHANGELOG.md) records delivery limits.
The upstream [MIT license](LICENSE), [NOTICE](NOTICE), and
[trademark guidance](TRADEMARKS.md) apply. The hosted
[Proof](https://proofeditor.ai) product is made by [Every](https://every.to).
