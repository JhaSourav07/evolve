import { describe, expect, it, vi } from 'vitest';
import { createSessionId, createToolCallId } from '../ids/index.js';
import { InMemoryEventBus } from './bus.js';
import { validateEventPayload } from './validator.js';

describe('Event Schemas & Validation', () => {
  it('validates a valid user_prompt payload', () => {
    const valid = validateEventPayload('user_prompt', {
      prompt: 'Refactor login page',
      context: { framework: 'react' },
    });
    expect(valid.prompt).toBe('Refactor login page');
    expect(valid.context?.['framework']).toBe('react');
  });

  it('rejects an invalid tool_call payload with missing arguments', () => {
    expect(() =>
      validateEventPayload('tool_call', {
        toolCallId: 'call_1',
        // missing toolName and arguments
      }),
    ).toThrow(/Validation failed for event \[tool_call\]/);
  });

  it('validates execution_result payload correctly', () => {
    const result = validateEventPayload('execution_result', {
      commandId: 'cmd_1',
      command: 'pnpm test',
      exitCode: 0,
      stdout: 'All tests passed',
      stderr: '',
      durationMs: 420,
    });
    expect(result.exitCode).toBe(0);
    expect(result.durationMs).toBe(420);
  });
});

describe('InMemoryEventBus', () => {
  it('publishes and subscribes to typed events with envelopes', () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn();
    const sessionId = createSessionId();

    bus.on('session_started', handler);
    bus.emit('session_started', {
      id: 'evt_1',
      sessionId,
      type: 'session_started',
      timestamp: Date.now(),
      payload: {
        goal: 'Implement events',
        workspaceRoot: '/workspace',
      },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'session_started',
        payload: {
          goal: 'Implement events',
          workspaceRoot: '/workspace',
        },
      }),
    );
  });

  it('supports onAny wildcard listeners', () => {
    const bus = new InMemoryEventBus();
    const anyHandler = vi.fn();
    bus.onAny(anyHandler);

    bus.emit('solution_accepted', {
      id: 'evt_2',
      sessionId: createSessionId(),
      type: 'solution_accepted',
      timestamp: Date.now(),
      payload: {
        summary: 'Feature implemented cleanly',
        acceptedAt: Date.now(),
      },
    });

    expect(anyHandler).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes cleanly', () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on('tool_call', handler);

    bus.emit('tool_call', {
      id: 'evt_3',
      sessionId: createSessionId(),
      type: 'tool_call',
      timestamp: Date.now(),
      payload: {
        toolCallId: createToolCallId(),
        toolName: 'fs_read',
        arguments: { path: 'README.md' },
      },
    });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();

    bus.emit('tool_call', {
      id: 'evt_4',
      sessionId: createSessionId(),
      type: 'tool_call',
      timestamp: Date.now(),
      payload: {
        toolCallId: createToolCallId(),
        toolName: 'fs_read',
        arguments: { path: 'README.md' },
      },
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
