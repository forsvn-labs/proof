# proof structure

This Git root owns the files tracked in [forsvn-labs/proof](https://github.com/forsvn-labs/proof). The repository is public. Keep private planning and external folder identities in the authorized Drive lookup.

VISION.md records purpose. ROADMAP.md owns priorities, active work, blockers, and the live handoff. CHANGELOG.md records verified delivery. STRUCTURE.md maps ownership and working commands. BRAIN.md locates external materials.

## Architecture and ownership

packages/ owns document core, editor, server, SQLite store, and the agent bridge. apps/proof-example/ is the example. src/ and server/ own the fork UI and HTTP routes. docs/conquistador-review.md defines the added review panel. LICENSE, NOTICE, and TRADEMARKS.md preserve upstream boundaries.

## Locations

- [AGENT_CONTRACT.md](AGENT_CONTRACT.md)
- [LICENSE](LICENSE)
- [NOTICE](NOTICE)
- [README.md](README.md)
- [TRADEMARKS.md](TRADEMARKS.md)
- [apps](apps/)
- [docs](docs/)
- [package-lock.json](package-lock.json)
- [package.json](package.json)
- [packages](packages/)
- [public](public/)
- [scripts](scripts/)
- [server](server/)
- [src](src/)
- [tsconfig.json](tsconfig.json)
- [tsconfig.server.json](tsconfig.server.json)
- [vite.config.ts](vite.config.ts)

## Working commands

- From `.`, run `bun install` before package work. Available commands: `bun run dev`, `bun run build`, `bun run test`.

Use [README.md](README.md) for setup details and project-specific validation. This record migration does not re-run application release or deployment gates.

## External materials and recall

Use BRAIN.md for original media, sendables, and verification evidence. Keep deployable assets needed by a build in Git with their source and license. Mem0 is optional recall through the correct Executor v2 account. Store a scope, project key, source pointer, and truth date; open the current source before using a recalled claim. Do not upload credentials, private identity, medical, finance, or employer-confidential source bodies.
