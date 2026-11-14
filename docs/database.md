# Database Architecture & Storage

## 1. Storage Strategy

Evolve uses **SQLite** for local persistence.

### Why SQLite?
- **Zero Server Setup**: Single file database embedded in the application process.
- **ACID Compliant**: Complete transaction guarantees and crash safety.
- **WAL Mode (Write-Ahead Logging)**: High-concurrency reads alongside concurrent writes without locking reader transactions.
- **Portability**: Database files live in `.evolve/evolve.db` inside user workspaces or user home directories, easily inspected with standard CLI tools (`sqlite3`).

---

## 2. Planned Schema Entities

```mermaid
erDiagram
    SESSION ||--o{ EXECUTION_TRACE : contains
    EXECUTION_TRACE ||--o{ STEP : contains
    STEP ||--o| TOOL_CALL : invokes
    STEP ||--o| TOOL_RESULT : receives
    SESSION ||--o{ REFLEXION_MEMORY : produces
    REFLEXION_MEMORY }o--o{ EXECUTION_TRACE : references

    SESSION {
        string id PK
        string goal
        datetime created_at
        datetime updated_at
        string status
    }

    EXECUTION_TRACE {
        string id PK
        string session_id FK
        string trigger_event
        datetime started_at
        datetime completed_at
        boolean success
    }

    STEP {
        string id PK
        string trace_id FK
        integer step_number
        string thought
        string action_type
        json action_payload
        datetime created_at
    }

    TOOL_CALL {
        string id PK
        string step_id FK
        string tool_name
        json arguments
        datetime created_at
    }

    TOOL_RESULT {
        string id PK
        string tool_call_id FK
        integer exit_code
        string output
        string error
        datetime completed_at
    }

    REFLEXION_MEMORY {
        string id PK
        string session_id FK
        string task_context
        string failure_reason
        string critique
        string suggested_fix
        float similarity_vector
        datetime created_at
    }
```

---

## 3. Migration Strategy
All database migrations are version-controlled SQL files running sequentially with automated rollback capability.
