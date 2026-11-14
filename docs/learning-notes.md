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

- We configure `pnpm-workspace.yaml` with `packages/*`.
- Each package maintains its own `package.json` with explicit dependencies.
- This prevents "phantom dependencies" where code relies on transitive dependencies that happen to be installed in a shared root `node_modules`.

#### 3. Vitest Workspace Testing

- Vitest provides native TypeScript execution and ESM support out of the box.
- Using `vitest.workspace.ts`, tests across all workspace packages run under a single command (`pnpm run test`) while isolating package environments.
