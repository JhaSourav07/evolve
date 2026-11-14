# Event System & Lifecycle

## 1. Why an Event-Driven Architecture?

AI agents are asynchronous, long-running processes. Decoupling the cognitive loop from presentation (CLI) and storage (database) via a typed event bus provides:

1. **Pluggable Observers**: The CLI can render streaming progress bars, while the database records event traces independently without inter-dependencies.
2. **Deterministic Replay**: An execution can be replayed and inspected event-by-event for debugging and auditing.
3. **Cancellation & Pause**: Events provide clear interception points to cancel running tasks or request human confirmation.

---

## 2. Event Hierarchy

All events adhere to a strict envelope format:

```typescript
export interface AgentEvent<TType extends string = string, TPayload = unknown> {
  id: string;
  type: TType;
  timestamp: number;
  sessionId: string;
  payload: TPayload;
}
```

### Core Event Types

- `agent:started`: Dispatched when a new session or goal execution begins.
- `agent:thought`: Dispatched when the LLM outputs reasoning text before tool selection.
- `tool:executing`: Dispatched immediately before tool execution begins (used for permission gating).
- `tool:completed`: Dispatched when tool execution terminates successfully.
- `tool:failed`: Dispatched when a tool throws an error or returns a non-zero exit code.
- `reflection:created`: Dispatched when the agent analyzes a failure and synthesizes a lesson.
- `agent:completed`: Dispatched when the primary goal is achieved.
- `agent:failed`: Dispatched when the agent encounters an unrecoverable limit or error.
