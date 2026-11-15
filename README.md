# Evolve

> A local-first, self-improving AI coding agent built from scratch.

Evolve is an autonomous coding agent designed with data sovereignty, transparency, and self-reflection at its core. It operates entirely on your local machine using local LLMs (via Ollama), stores its memory and execution traces in SQLite, and improves its problem-solving accuracy over time through iterative reflection.

---

## Key Principles

- **Local-First**: Complete privacy. Code, prompt traces, and database state remain on your local machine.
- **Autonomous Sense-Plan-Act-Reflect Loop**: Continuous feedback loops driving code generation, tool invocation, and automated verification.
- **Self-Improving (Reflexion)**: Learns from failures by evaluating past execution traces, identifying root causes, and persisting critiques to episodic memory.
- **Strict Architecture**: Built with TypeScript strict mode, modular packages, and test-driven design.

---

## Monorepo Architecture

Evolve is organized as a pnpm workspace with focused package boundaries:

- [`packages/core`](./packages/core): Pure domain models, system interfaces, typed event bus, and core utilities.
- [`packages/db`](./packages/db): SQLite persistence with Drizzle ORM, WAL mode, migrations, and repositories.
- [`packages/agent`](./packages/agent): Ollama model provider, 9 sandboxed tools, ReAct cognitive loop, memory retrieval, and reflexion.
- [`packages/integrations`](./packages/integrations): External adapters (Terminal, VS Code, Pi) and conversation importers (Claude, Gemini) with consent management.
- [`packages/ml`](./packages/ml): Python training and evaluation pipeline for SFT (LoRA/QLoRA) and DPO dataset generation.
- [`apps/cli`](./apps/cli): Modern interactive terminal UI (Ink & React) with streaming, multiline input, human-in-the-loop approvals, and full command suite.

---

## Getting Started

### Prerequisites

- Node.js `>= 22.0.0`
- pnpm `>= 10.0.0`
- Git

### Workspace Commands

```bash
# Install dependencies across all workspace packages
pnpm install

# Typecheck all packages
pnpm run typecheck

# Lint with ESLint
pnpm run lint

# Check formatting with Prettier
pnpm run format:check

# Run test suite with Vitest
pnpm run test

# Build all packages via TypeScript project references
pnpm run build
```

---

### CLI & Interactive Agent

```bash
# Launch interactive agent interface
pnpm evolve

# Run with a one-shot goal or task
pnpm evolve chat "Read package.json and list all dependencies"

# Inspect system status and active model
pnpm evolve status

# View stored memory rules and preferences
pnpm evolve memory

# Manage integrations and collection consent
pnpm evolve integrations
```

---

## Documentation

- [CLI Reference & TUI Guide](./docs/cli.md)
- [Architecture Overview](./docs/architecture.md)
- [Database Schema & Migrations](./docs/database.md)
- [Event Bus & Lifecycle](./docs/events.md)
- [Interaction Integrations](./docs/integrations.md)
- [Machine Learning Pipeline](./docs/ml-pipeline.md)
- [Security & Sandbox Model](./docs/security.md)
- [Technical Learning Notes](./docs/learning-notes.md)
- [Changelog](./CHANGELOG.md)

---

## License

MIT © Sourav Jha
