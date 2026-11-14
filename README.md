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
- `packages/db`: SQLite persistence, migrations, and repositories (Milestone 2).
- `packages/agent`: Ollama provider, tool execution engine, cognitive loop, and reflection memory (Milestones 3–6).
- [`apps/cli`](./apps/cli): Command-line interface and terminal entrypoint.

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

## Documentation

- [Architecture Overview](./docs/architecture.md)
- [Database Schema & Migrations](./docs/database.md)
- [Event Bus & Lifecycle](./docs/events.md)
- [Security & Sandbox Model](./docs/security.md)
- [Technical Learning Notes](./docs/learning-notes.md)
- [Changelog](./CHANGELOG.md)

---

## License

MIT © Sourav Jha
