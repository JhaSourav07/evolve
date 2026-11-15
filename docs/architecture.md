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

---

## 6. Agent Runtime Architecture (`AgentRuntime`)

The agent runtime in `@evolve/agent` manages the autonomous execution loop independently of specific CLI interfaces or model providers:

```mermaid
flowchart TD
    Start(["session_started"]) --> UserPrompt["Emit user_prompt & Record in Conversation"]
    UserPrompt --> LoopCheck{"step < maxSteps AND !signal.aborted?"}

    LoopCheck -- "No (Limit or Abort)" --> FinishFailure["Emit session_completed (success: false)"]
    FinishFailure --> ReturnFailure(["Return Failure Result"])

    LoopCheck -- "Yes" --> AssembleContext["ContextManager: Build Context Messages & Prune if Needed"]
    AssembleContext --> FormatTools["ToolRegistry: Format Model Tool Definitions"]
    FormatTools --> ModelCall["ModelProvider.generate(messages, options)"]

    ModelCall --> EmitAssistant["Emit assistant_response & Record in Conversation"]
    EmitAssistant --> HasTools{"Model requested tool calls?"}

    HasTools -- "No (Task Complete)" --> FinishSuccess["Emit session_completed (success: true)"]
    FinishSuccess --> ReturnSuccess(["Return Success Result"])

    HasTools -- "Yes" --> ExecTools["Iterate Tool Calls"]
    ExecTools --> EmitToolCall["Emit tool_call"]
    EmitToolCall --> ToolLookup{"Tool Registered & Args Valid?"}

    ToolLookup -- "Valid" --> RunTool["tool.execute(params, context)"]
    ToolLookup -- "Invalid / Missing" --> ToolErr["Format Safe Error Output"]
    RunTool --> EmitResult["Emit tool_result & Record in Conversation"]
    ToolErr --> EmitResult

    EmitResult --> LoopCheck
```

### 6.1 Key Components

1. **`AgentRuntime`**:
   - The central orchestrator that drives iterations from start to conclusion.
   - Manages cancellation via standard `AbortSignal`.
   - Protects against runaway execution loops via configurable `maxSteps` (default: 20).
   - Encapsulates error recovery: crashes in tools or invalid tool parameters are converted into informative tool responses rather than crashing the runtime.
   - Emits strongly-typed, schema-validated lifecycle events at every step (`session_started`, `user_prompt`, `assistant_response`, `tool_call`, `tool_result`, `session_completed`).

2. **`ConversationManager`**:
   - Maintains the canonical sequence of messages: system messages, user queries, assistant replies, and tool results.
   - Preserves message order and provides serializable state snapshots (`toJSON` / `fromJSON`).

3. **`ContextManager`**:
   - Computes fast token estimates (~4 characters/token rule of thumb).
   - Assembles system instructions including workspace constraints, environment data, and operational guidelines.
   - Enforces token budgets (`maxContextTokens`): prunes middle conversation history while strictly preserving the system prompt, the initial user goal, and atomic tool-call/tool-result pairings.

4. **`ToolRegistry`**:
   - Central catalog for registering executable `AgentTool` implementations.
   - Automatically converts Zod parameter schemas into JSON Schema specifications consumed by LLMs.
