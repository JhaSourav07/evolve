# Database Architecture & Storage

## 1. Storage Strategy

Evolve uses **SQLite** with **Drizzle ORM** for local-first persistence.

### Why SQLite + Drizzle ORM?

- **Embedded & Zero Configuration**: SQLite runs directly inside the Node.js process using native C bindings (`better-sqlite3`). No database server, ports, or credentials required.
- **WAL Mode (Write-Ahead Logging)**: High-concurrency reads alongside concurrent writes without locking reader transactions (`PRAGMA journal_mode = WAL;`).
- **Foreign Key Enforcement**: Explicitly enabled on every connection (`PRAGMA foreign_keys = ON;`) to guarantee relational integrity and prevent orphan records.
- **Drizzle ORM Type Safety**: Drizzle provides compile-time TypeScript type inference from table schemas with zero runtime overhead and direct SQL compatibility.
- **Portability**: All project data lives in `.evolve/evolve.db`, making backups, inspection, and state transfer trivial.

---

## 2. Entity Relationship Diagram

```mermaid
erDiagram
    PROJECTS ||--o{ SESSIONS : contains
    PROJECTS ||--o{ KNOWLEDGE : stores
    SESSIONS ||--o{ EVENTS : logs
    SESSIONS ||--o{ TOOL_CALLS : invokes
    SESSIONS ||--o{ FEEDBACK : receives
    SESSIONS ||--o{ TRAINING_EXAMPLES : produces
    TOOL_CALLS ||--o| FEEDBACK : evaluates

    PROJECTS {
        text id PK
        text name
        text path UK
        integer created_at
        integer updated_at
    }

    SESSIONS {
        text id PK
        text project_id FK
        text goal
        text status
        integer created_at
        integer updated_at
    }

    EVENTS {
        text id PK
        text session_id FK
        text type
        text payload
        integer timestamp
    }

    TOOL_CALLS {
        text id PK
        text session_id FK
        text tool_name
        text arguments
        text output
        text error
        text status
        integer created_at
        integer completed_at
    }

    FEEDBACK {
        text id PK
        text session_id FK
        text tool_call_id FK
        text type
        integer rating
        text notes
        integer created_at
    }

    KNOWLEDGE {
        text id PK
        text project_id FK
        text category
        text key
        text content
        real confidence
        integer created_at
        integer updated_at
    }

    TRAINING_EXAMPLES {
        text id PK
        text session_id FK
        text prompt
        text response
        text critique
        integer is_successful
        text metadata
        integer created_at
    }

    MODEL_VERSIONS {
        text id PK
        text provider
        text name
        text parameter_size
        integer is_active
        integer installed_at
    }
```

---

## 3. Database Tables Breakdown

| Table               | Purpose                                                                      | Primary Key | Foreign Keys                                                                      | Key Indexes                          |
| :------------------ | :--------------------------------------------------------------------------- | :---------- | :-------------------------------------------------------------------------------- | :----------------------------------- |
| `projects`          | Tracks workspace project paths and metadata.                                 | `id`        | None                                                                              | `path` (UNIQUE)                      |
| `sessions`          | Represents user interactions or task goals.                                  | `id`        | `project_id -> projects(id)` ON DELETE CASCADE                                    | `project_id`, `status`               |
| `events`            | Append-only event stream of the entire execution.                            | `id`        | `session_id -> sessions(id)` ON DELETE CASCADE                                    | `session_id`, `type`, `timestamp`    |
| `tool_calls`        | Records tool execution requests, arguments, outputs, and errors.             | `id`        | `session_id -> sessions(id)` ON DELETE CASCADE                                    | `session_id`, `status`, `tool_name`  |
| `feedback`          | Captures human and automated evaluations for actions and sessions.           | `id`        | `session_id -> sessions(id)`, `tool_call_id -> tool_calls(id)` ON DELETE SET NULL | `session_id`, `tool_call_id`, `type` |
| `knowledge`         | Self-improving episodic memory and project rules (Reflexion).                | `id`        | `project_id -> projects(id)` ON DELETE CASCADE                                    | `project_id`, `category`, `key`      |
| `training_examples` | Curated prompt/response pairs with critiques for evaluation and fine-tuning. | `id`        | `session_id -> sessions(id)` ON DELETE SET NULL                                   | `session_id`, `is_successful`        |
| `model_versions`    | Tracks local models available via Ollama or custom providers.                | `id`        | None                                                                              | `provider`, `name`                   |

---

## 4. Migration Engine

Migrations are tracked in the `schema_migrations` table:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
```

The migration runner ([packages/db/src/migrations/runner.ts](file:///run/media/sourav/New%20Volume/Projects/evolve/packages/db/src/migrations/runner.ts)) executes pending migrations sequentially inside an atomic transaction when the application initializes.

---

## 5. Repository Pattern

Application code and the CLI never write raw SQL. All operations are encapsulated in typed repositories:

- `ProjectRepository`
- `SessionRepository`
- `EventRepository`
- `ToolCallRepository`
- `FeedbackRepository`
- `KnowledgeRepository`
- `TrainingRepository`
- `ModelVersionRepository`

Multi-step operations (e.g. creating a session with an initial event, or completing a tool call with feedback) use atomic `db.transaction()` blocks to prevent inconsistent database states.
