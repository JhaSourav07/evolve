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
export type PlanId = Brand<string, 'PlanId'>;
export type TaskId = Brand<string, 'TaskId'>;

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

export function createPlanId(): PlanId {
  return `plan_${randomUUID()}` as PlanId;
}

export function createTaskId(suffix?: string | number): TaskId {
  return (
    suffix !== undefined ? `task_${suffix}` : `task_${randomUUID().slice(0, 8)}`
  ) as TaskId;
}

export function isSessionId(value: string): value is SessionId {
  return typeof value === 'string' && value.startsWith('sess_');
}

export function isToolCallId(value: string): value is ToolCallId {
  return typeof value === 'string' && value.startsWith('call_');
}

export function isPlanId(value: string): value is PlanId {
  return typeof value === 'string' && value.startsWith('plan_');
}

export function isTaskId(value: string): value is TaskId {
  return typeof value === 'string' && value.startsWith('task_');
}
