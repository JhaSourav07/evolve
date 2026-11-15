# Technical Learning Notes

This document captures engineering concepts, design decisions, and architectural lessons learned during the development of Evolve.

---

## Milestone 0: Monorepo & TypeScript Strict Architecture

### Key Concepts

#### 1. TypeScript Strictness Flags

- `strict: true`: Bundles standard type-safety checks (`noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`).
- `noUncheckedIndexedAccess: true`: Forces array index and object dictionary accesses to include `undefined` in their type signatures:
  ```typescript
  const list: string[] = ['a', 'b'];
  const item = list[0]; // Type is string | undefined, NOT string
  ```
  This prevents hidden runtime `TypeError: Cannot read properties of undefined` bugs.
- `exactOptionalPropertyTypes: true`: Distinguishes between omitting a key versus assigning `undefined`:
  ```typescript
  interface Config {
    timeout?: number;
  }
  // With exactOptionalPropertyTypes: true,
  // { timeout: undefined } is invalid. The property must either be a number or omitted.
  ```

#### 2. Monorepo Isolation with pnpm

- We configure `pnpm-workspace.yaml` with `packages/*` and `apps/*`.
- Each package maintains its own `package.json` with explicit dependencies.
- This prevents "phantom dependencies" where code relies on transitive dependencies that happen to be installed in a shared root `node_modules`.

#### 3. Vitest Workspace Testing

- Vitest provides native TypeScript execution and ESM support out of the box.
- Using `vitest.workspace.ts`, tests across all workspace packages run under a single command (`pnpm run test`) while isolating package environments.

---

## Milestone 1: Core Domain Contracts & Design Patterns

### Key Concepts

#### 1. Software Interfaces (Contracts vs. Implementations)

An **interface** defines _what_ a component can do without specifying _how_ it does it.

- In `@evolve/core`, `ModelProvider` declares `generate()` and `stream()`.
- The agent loop only depends on `ModelProvider`.
- Whether inference runs via local Ollama, a mock provider in tests, or a remote engine, the agent loop's code never changes.

#### 2. Dependency Injection (Inversion of Control)

Instead of a class or function creating its dependencies internally:

```typescript
// Tight coupling (Hard to test, inflexible)
class Agent {
  private provider = new OllamaProvider(); // Hardcoded!
}

// Dependency Injection (Clean, testable)
class Agent {
  constructor(private provider: ModelProvider) {} // Injected!
}
```

This allows injecting mock providers during unit tests and swap implementations at runtime.

#### 3. Branded Types (Nominal Typing in TypeScript)

TypeScript uses a **structural type system** (if two types have the same shape, they are interchangeable). This means two distinct IDs (`sessionId: string` and `toolCallId: string`) can be accidentally swapped without compiler errors.
**Branded types** attach a unique compile-time tag to primitive types:

```typescript
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };
export type SessionId = Brand<string, 'SessionId'>;
export type ToolCallId = Brand<string, 'ToolCallId'>;
```

Now passing a `ToolCallId` to a function expecting a `SessionId` produces a compilation error.

#### 4. The Result Monad Pattern

Throwing exceptions for expected domain failures (e.g. invalid config, file not found) disrupts execution flow and makes error handling implicit.
The **Result** pattern makes success and failure explicit in return types:

```typescript
export type Result<T, E = Error> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
```

The caller is forced to inspect `result.ok` before accessing `result.value`, eliminating unhandled crashes.
