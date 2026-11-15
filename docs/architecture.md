# Architecture Overview

## 1. System Vision

Evolve is an autonomous software engineering assistant that runs entirely on local infrastructure. It is designed around three non-negotiable guarantees:

1. **Local Execution**: Inference via local LLMs (Ollama), storage via SQLite.
2. **Auditability**: Every tool execution, reasoning step, and prompt token is logged as an immutable event trace.
3. **Continuous Reflection**: Errors and user interventions generate critique records stored in episodic memory to prevent repeated failure modes.

---

## 2. Layered Component Architecture

```mermaid
graph TD
    subgraph UI ["Presentation Layer"]
        CLI["@evolve/cli (Interactive Terminal UI)"]
    end

    subgraph Agent ["Cognitive Layer (@evolve/agent)"]
        Loop["Execution Loop (ReAct / Plan-Act-Observe)"]
        Memory["Reflexion Engine (Episodic Memory)"]
        Context["Context & Token Window Manager"]
    end

    subgraph Tools ["Action Layer (@evolve/agent/tools)"]
        FS["Filesystem Tools (Read, Write, Patch)"]
        Shell["Execution Tool (Process Sandbox)"]
        GitTool["Git Tools (Status, Diff, Commit)"]
    end

    subgraph Model ["Inference Layer (@evolve/agent/providers)"]
        OllamaProvider["Ollama Local Provider"]
    end

    subgraph Data ["Persistence Layer (@evolve/db)"]
        SQLite["SQLite (WAL Mode + Migrations)"]
        Repositories["Trace / Memory / Session Repositories"]
    end

    subgraph Core ["Domain Core (@evolve/core)"]
        Types["Domain Models & Protocols"]
        EventBus["Typed Event Bus"]
        Utils["Result Types & Error Guards"]
    end

    CLI --> Loop
    Loop --> Context
    Loop --> OllamaProvider
    Loop --> Tools
    Loop --> Memory
    Memory --> Repositories
    Repositories --> SQLite
    Loop --> EventBus
    Tools --> EventBus
    Loop -.-> Types
    Repositories -.-> Types
```

---

## 3. Package Responsibilities

| Package         | Location         | Responsibility                                                                                     | Dependencies                                 |
| :-------------- | :--------------- | :------------------------------------------------------------------------------------------------- | :------------------------------------------- |
| `@evolve/core`  | `packages/core`  | Pure domain types, events, error definitions, and result monads.                                   | Zero runtime dependencies                    |
| `@evolve/db`    | `packages/db`    | Database connection, schema migrations, query layer, and repository implementations.               | `@evolve/core`, `better-sqlite3` or `kysely` |
| `@evolve/agent` | `packages/agent` | ReAct cognitive loop, Ollama API client, tool definitions, execution sandbox, and reflexion logic. | `@evolve/core`, `@evolve/db`                 |
| `@evolve/cli`   | `apps/cli`       | Command-line parser, terminal UI, real-time event streaming, and approval prompts.                 | `@evolve/core`, `@evolve/agent`              |

---

## 4. Model Provider & Prompt Lifecycle

The `@evolve/agent` package connects the cognitive agent loop to local inference engines via `ModelProvider`:

```mermaid
sequenceDiagram
    participant Agent as Agent Loop
    participant Provider as OllamaProvider
    participant Ollama as Ollama Daemon (:11434)
    participant Model as Qwen 2.5 / 3.5 Model Weights

    Agent->>Provider: generate(messages, { tools })
    Note over Provider: 1. Format messages (system/user/assistant/tool)<br/>2. Format tools into JSON schema specifications
    Provider->>Ollama: POST /api/chat (JSON payload)
    Note over Ollama,Model: 3. Tokenize input strings into token IDs<br/>4. Forward pass through neural network layers<br/>5. Generate next tokens autoregressively
    Ollama-->>Provider: HTTP Response (message content / tool_calls / usage)
    Note over Provider: 6. Parse native & fallback tool calls<br/>7. Calculate token usage & map finishReason
    Provider-->>Agent: ModelResponse { message, usage, finishReason }
```

---

## 5. The Cognitive Loop (Sense $\to$ Plan $\to$ Act $\to$ Observe $\to$ Reflect)

1. **Sense**: Gather workspace state, directory layout, recent git diffs, and the user's objective.
2. **Plan**: Formulate the next atomic action using the local model. If a plan requires multiple steps, output structured tool calls.
3. **Act**: Execute the requested tool inside an audited, safe execution boundary.
4. **Observe**: Read the tool output (stdout, stderr, exit code, file contents).
5. **Reflect**: If the action fails (test failure, syntax error, missing dependency), evaluate the cause, create an episodic reflection, and adjust the next planning step.
