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

  it('validates execution lifecycle events correctly', () => {
    const execStarted = validateEventPayload('execution_started', {
      planId: 'plan_1',
      sessionId: 'sess_1',
      totalTasks: 3,
      mode: 'detailed',
    });
    expect(execStarted.totalTasks).toBe(3);

    const taskStarted = validateEventPayload('task_started', {
      planId: 'plan_1',
      taskId: 'task_1',
      taskIndex: 0,
      title: 'Initialize auth',
      riskLevel: 'low',
    });
    expect(taskStarted.taskId).toBe('task_1');

    const toolExecution = validateEventPayload('tool_execution_completed', {
      planId: 'plan_1',
      taskId: 'task_1',
      toolName: 'write_file',
      toolCallId: 'call_1',
      durationMs: 45,
      success: true,
      outputSummary: 'Wrote 120 bytes',
    });
    expect(toolExecution.success).toBe(true);

    const verifCompleted = validateEventPayload('verification_completed', {
      planId: 'plan_1',
      taskId: 'task_1',
      stage: 'typecheck',
      success: true,
      durationMs: 250,
    });
    expect(verifCompleted.stage).toBe('typecheck');

    const execCompleted = validateEventPayload('execution_completed', {
      planId: 'plan_1',
      sessionId: 'sess_1',
      success: true,
      durationMs: 1500,
      tasksCompleted: 3,
      tasksFailed: 0,
    });
    expect(execCompleted.tasksCompleted).toBe(3);

    const memCreated = validateEventPayload('memory_created', {
      memoryId: 'mem_1',
      category: 'user_preference',
      key: 'test_runner',
      confidence: 0.95,
      status: 'verified',
    });
    expect(memCreated.key).toBe('test_runner');

    const memRetrieved = validateEventPayload('memory_retrieved', {
      query: 'vitest',
      memoryIds: ['mem_1', 'mem_2'],
      count: 2,
    });
    expect(memRetrieved.count).toBe(2);
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
