# Event System & Lifecycle

## 1. Why an Event-Driven Architecture?

AI agents are asynchronous, long-running processes. Decoupling the cognitive loop from presentation (CLI) and storage (database) via a typed event bus provides:

1. **Pluggable Observers**: The CLI can render streaming output and progress indicators, while the database records event traces independently without direct dependencies between them.
2. **Deterministic Replay**: An execution can be replayed and inspected event-by-event for debugging and auditing.
3. **Interception**: Events provide clear hook points to intercept running tasks (e.g., requesting user permission before tool execution).

---

## 2. Strongly-Typed Event Map (`AgentEventMap`)

Every event in Evolve has an explicit type and strongly-typed payload defined in `@evolve/core`:

| Event Name           | Payload Description                                                                                                  |
| :------------------- | :------------------------------------------------------------------------------------------------------------------- |
| `session:started`    | `{ sessionId: SessionId; goal: string; timestamp: number }`                                                          |
| `session:completed`  | `{ sessionId: SessionId; success: boolean; resultSummary?: string; timestamp: number }`                              |
| `session:failed`     | `{ sessionId: SessionId; error: EvolveError; timestamp: number }`                                                    |
| `model:request`      | `{ sessionId: SessionId; messageCount: number; timestamp: number }`                                                  |
| `model:response`     | `{ sessionId: SessionId; finishReason: string; totalTokens?: number; timestamp: number }`                            |
| `model:stream`       | `{ sessionId: SessionId; delta: string; timestamp: number }`                                                         |
| `tool:executing`     | `{ sessionId: SessionId; toolCallId: ToolCallId; toolName: string; params: unknown; timestamp: number }`             |
| `tool:completed`     | `{ sessionId: SessionId; toolCallId: ToolCallId; toolName: string; result: ToolExecutionResult; timestamp: number }` |
| `tool:failed`        | `{ sessionId: SessionId; toolCallId: ToolCallId; toolName: string; error: string; timestamp: number }`               |
| `reflection:created` | `{ sessionId: SessionId; critique: string; suggestion: string; timestamp: number }`                                  |

---

## 3. The `EventBus` Interface & `InMemoryEventBus`

The `@evolve/core` package provides both the contract (`EventBus`) and a zero-dependency reference implementation (`InMemoryEventBus`):

```typescript
import { InMemoryEventBus } from '@evolve/core';

const bus = new InMemoryEventBus();

// Strongly typed: payload is inferred based on event name
const unsubscribe = bus.on('tool:executing', (payload) => {
  console.log(`Tool starting: ${payload.toolName}`);
});

// Clean unsubscription
unsubscribe();
```
