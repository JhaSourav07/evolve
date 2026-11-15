# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initialized repository and public GitHub remote at `https://github.com/JhaSourav07/evolve`.
- Configured pnpm monorepo workspace for `packages/*` and `apps/*`.
- Configured strict TypeScript compiler configuration (`tsconfig.base.json`, `tsconfig.json`).
- Configured ESLint (flat config) and Prettier code formatting with workspace scripts.
- Configured Vitest test runner across packages (`vitest.workspace.ts`).
- Implemented `@evolve/core` domain contracts:
  - Branded ID types (`SessionId`, `StepId`, `TraceId`, `ToolCallId`, `MemoryId`) with type guards and generators.
  - Hierarchical application error classes (`EvolveError`, `ConfigurationError`, `ValidationError`, `ModelProviderError`, `ToolExecutionError`, `SecurityError`, `PathTraversalError`).
  - Runtime configuration schemas and types with Zod (`EvolveConfigSchema`, `ModelConfigSchema`, `WorkspaceConfigSchema`, `SecurityConfigSchema`, `StorageConfigSchema`).
  - Model provider interfaces (`ModelProvider`, `ModelMessage`, `ModelResponse`, `ModelStreamChunk`, `ModelUsage`).
  - Agent tool interfaces (`AgentTool`, `ToolDefinition`, `ToolExecutionContext`, `ToolExecutionResult`).
  - Strongly-typed event contracts (`AgentEventMap`, `EventBus`, `InMemoryEventBus`).
  - System logger interface and `NoOpLogger` implementation.
  - Validation utilities, `Result<T, E>` monad, and workspace path containment validator.
- Implemented `@evolve/db` local persistence package:
  - SQLite integration with Drizzle ORM and `better-sqlite3`.
  - Enforced foreign key constraints (`PRAGMA foreign_keys = ON;`) and WAL mode.
  - Transaction-safe migration runner with initial schema migration (`001_initial_schema`).
  - Implemented 8 relational tables: `projects`, `sessions`, `events`, `tool_calls`, `feedback`, `knowledge`, `training_examples`, `model_versions`.
  - Created typed repository classes for all domain entities with atomic transaction support.
  - Implemented test database reset utility (`resetTestDatabase`).
  - Added integration test suites for connections, migrations, and repositories (28 total workspace tests passing).
- Updated documentation in `docs/database.md` and `docs/learning-notes.md`.
