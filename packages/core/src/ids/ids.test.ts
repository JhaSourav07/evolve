import { describe, expect, it } from 'vitest';
import {
  createMemoryId,
  createSessionId,
  createStepId,
  createToolCallId,
  createTraceId,
  isSessionId,
  isToolCallId,
} from './index.js';

describe('Branded ID Generators & Type Guards', () => {
  it('generates distinct IDs with expected prefixes', () => {
    const session1 = createSessionId();
    const session2 = createSessionId();
    expect(session1).not.toBe(session2);
    expect(session1.startsWith('sess_')).toBe(true);

    const stepId = createStepId();
    expect(stepId.startsWith('step_')).toBe(true);

    const traceId = createTraceId();
    expect(traceId.startsWith('trace_')).toBe(true);

    const toolCallId = createToolCallId();
    expect(toolCallId.startsWith('call_')).toBe(true);

    const memoryId = createMemoryId();
    expect(memoryId.startsWith('mem_')).toBe(true);
  });

  it('validates IDs correctly with type guards', () => {
    const session = createSessionId();
    expect(isSessionId(session)).toBe(true);
    expect(isSessionId('not_a_session')).toBe(false);

    const call = createToolCallId();
    expect(isToolCallId(call)).toBe(true);
    expect(isToolCallId('random_id')).toBe(false);
  });
});
