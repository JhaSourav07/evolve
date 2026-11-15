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
- Implemented Evolve internal event system:
  - Zod schemas for 11 core events: `user_prompt`, `assistant_response`, `tool_call`, `tool_result`, `command_execution`, `execution_result`, `human_feedback`, `solution_accepted`, `solution_rejected`, `session_started`, `session_completed`.
  - Created `EventService` in `@evolve/db` providing validation, in-memory pub/sub, SQLite persistence, flexible filtering, and ordered session history retrieval.
  - Added wildcard observer support (`subscribe`) and specific event subscriptions (`subscribeTo`).
  - Added integration tests covering validation, ordering, filtering, and database persistence (36 total workspace tests passing).
- Implemented `@evolve/agent` package with Ollama model provider:
  - Implemented `OllamaProvider` satisfying `@evolve/core` `ModelProvider` contract.
  - Implemented model discovery (`/api/tags`), auto-selection of available coding models, and health checks (`/api/version`).
  - Added non-streaming generation and real-time streaming via `AsyncIterable<ModelStreamChunk>` with NDJSON buffer handling.
  - Added native Ollama and fallback JSON tool-call parsing with arguments normalization.
  - Implemented `MockModelProvider` for offline, deterministic unit testing.
  - Added comprehensive test suites with mocked network responses and live local Ollama verification (49 total workspace tests passing).
- Implemented `@evolve/agent` runtime and execution loop:
  - Implemented `AgentRuntime` managing the iterative think-act-observe agent loop, tool execution, step limits, cancellation, and event emission.
  - Implemented `ConversationManager` maintaining structured chronological message history (`system`, `user`, `assistant`, `tool`).
  - Implemented `ContextManager` handling token estimation, system prompt construction, and context pruning while preserving tool-call pairs.
  - Implemented `ToolRegistry` and basic filesystem tools (`readFileTool`, `writeFileTool`) with workspace boundary enforcement.
  - Added resilient error recovery for unknown tools, invalid parameters, and unhandled tool execution exceptions.
  - Implemented `createMinimalOllamaAgent` demonstrating end-to-end integration with local Ollama instances.
  - Added integration test suite verifying multi-step tasks, iteration limits, AbortSignal cancellation, error recovery, and SQLite event persistence (58 total workspace tests passing).
- Implemented Evolve tool execution package (`@evolve/agent/tools`):
  - Implemented 9 standard tools: `read_file`, `write_file`, `edit_file`, `list_files`, `search_code`, `run_command`, `run_tests`, `git_status`, and `git_diff`.
  - Added multi-layered security controls with `assertSafePath`, canonical `realpath` validation, and symlink escape prevention.
  - Implemented sensitive file protection blocking access to `.env*`, `.git/config`, SSH keys, private keys, certificates, and credentials.
  - Implemented human-in-the-loop approval gating (`ToolApprovalHandler`) for destructive operations (`write_file`, `edit_file`, `run_command`, `run_tests`).
  - Added process execution sandbox with timeouts (`timeoutMs`), stream buffer capping (50KB), closed stdin, and two-stage `SIGTERM` -> `SIGKILL` escalation.
  - Implemented safe Git operations using direct `execFile` binary execution, `-C <workspaceRoot>` directory pinning, and `--` operand separators.
  - Added unit and integration tests covering normal usage, path traversal, sensitive file blocks, approval rejection, timeouts, output truncation, and Git flag injection (82 total workspace tests passing).
- Implemented Evolve feedback and memory systems:
  - Added migration `002_feedback_and_memory` adding action/response feedback targets, written corrections, technical correctness verification, and SQLite FTS5 full-text indexing.
  - Implemented `FeedbackService` supporting action-level (`toolCallId`) and response-level (`sessionId`) feedback with positive (+1), partial (0), and negative (-1) ratings.
  - Implemented written user corrections and strict separation between subjective human ratings and objective technical correctness (`isTechnicallyCorrect`).
  - Implemented `convertToTrainingExample` turning verified human feedback into structured fine-tuning datasets with gold-standard corrections.
  - Implemented `MemoryService` managing user preferences, project conventions, and experience memories.
  - Integrated SQLite FTS5 BM25 keyword retrieval with query sanitization and prefix stemming.
  - Integrated retrieved experiences into `AgentRuntime` and `ContextManager` system prompt construction.
  - Added unit and integration tests for feedback recording, training example generation, FTS5 retrieval, and agent memory injection (96 total workspace tests passing).
- Updated database architecture documentation (`docs/database.md`).
- Updated security architecture documentation (`docs/security.md`).
- Updated architecture documentation with the complete prompt lifecycle trace and runtime execution loop specifications.
