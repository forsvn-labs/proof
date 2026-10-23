# Proof fork structure

This public npm workspace contains reusable SDK packages, an example,
and the FORSVN fork's editor/server integration.

## Code architecture

The Vite editor uses the document/editor layer. Express routes expose
document operations and the agent bridge; Yjs/Hocuspocus handles live
collaboration, while SQLite persists document state. The Conquistador
routes add channel review and browser-only approval stamps tied to the
clean Markdown hash. [server/index.ts](server/index.ts) binds the local
API to `127.0.0.1`; [vite.config.ts](vite.config.ts) configures editor port
3000 and proxies to the API on port 4000.

```text
packages/doc-core/          Shared document contracts
packages/doc-editor/        Editor package surface
packages/doc-server/        Server package surface
packages/doc-store-sqlite/  SQLite store package surface
packages/agent-bridge/      Agent client package
apps/proof-example/         Example SDK application
src/editor/                Markdown editor and collaboration UI
src/ui/                    Review and interaction controls
src/tests/                 SDK, editor, and server regressions
server/                    HTTP routes, collaboration, and persistence
server/conquistador-review.ts  Fork review and approval routes
public/                    Browser assets
scripts/                   Build finalization helpers
docs/                      API contracts, ADR, and fork review guide
package-lock.json          Locked npm dependency graph
```

[README.md](README.md) has setup; [AGENT_CONTRACT.md](AGENT_CONTRACT.md)
defines the HTTP contract. [docs/conquistador-review.md](docs/conquistador-review.md)
defines review semantics. [LICENSE](LICENSE), [NOTICE](NOTICE), and
[TRADEMARKS.md](TRADEMARKS.md) preserve upstream boundaries.

## External knowledge architecture

[BRAIN.md](BRAIN.md) resolves `forsvn/proof` to its Google Drive project
and `OPEN THIS.md` map. Research, private planning, and review resources
belong there; executable code and code contracts belong in Git. SQLite
remains the runtime document store, separate from rich project knowledge.
Private review content is not copied into this public repository.
[STATUS.md](STATUS.md) owns current state, rather than archived handoffs.
