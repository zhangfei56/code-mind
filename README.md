# code-mind

Local-first agent code tool (pnpm monorepo).

## Requirements

- **Node.js 22** (see [.nvmrc](.nvmrc))

```bash
nvm use 22.22.0
corepack enable pnpm
```

## Quick start

See **[docs/cli-guide.md](docs/cli-guide.md)** for build, model config, and full CLI usage.

```bash
pnpm install
pnpm build
pnpm test
pnpm dev -- "explain this repo" --cwd .
```

CLI:

```bash
code-mind --help
code-mind serve --cwd . --port 3847
```

HTTP API (same as `web start`):

```bash
pnpm web -- .
curl http://127.0.0.1:3847/api/sessions
```

## Workspace layout

- `apps/cli` — `code-mind` CLI and REPL
- `apps/api-server` — session HTTP API (`@code-mind/api-server`)
- `packages/*` — core libraries
- `docs/` — split docs: [README](docs/README.md) (router), [implementation](docs/implementation.md), [architecture](docs/architecture.md)

See [docs/README.md](docs/README.md) and root [AGENTS.md](AGENTS.md).
