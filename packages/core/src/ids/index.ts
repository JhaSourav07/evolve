import { randomUUID } from 'node:crypto';

declare const brand: unique symbol;

/**
 * A branded type helper that attaches a unique compile-time tag
 * to primitive types without runtime overhead.
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type SessionId = Brand<string, 'SessionId'>;
export type StepId = Brand<string, 'StepId'>;
export type TraceId = Brand<string, 'TraceId'>;
export type ToolCallId = Brand<string, 'ToolCallId'>;
export type MemoryId = Brand<string, 'MemoryId'>;

export function createSessionId(): SessionId {
  return `sess_${randomUUID()}` as SessionId;
}

export function createStepId(): StepId {
  return `step_${randomUUID()}` as StepId;
}

export function createTraceId(): TraceId {
  return `trace_${randomUUID()}` as TraceId;
}

export function createToolCallId(): ToolCallId {
  return `call_${randomUUID()}` as ToolCallId;
}

export function createMemoryId(): MemoryId {
  return `mem_${randomUUID()}` as MemoryId;
}

export function isSessionId(value: string): value is SessionId {
  return typeof value === 'string' && value.startsWith('sess_');
}

export function isToolCallId(value: string): value is ToolCallId {
  return typeof value === 'string' && value.startsWith('call_');
}
