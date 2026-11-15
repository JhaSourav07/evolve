import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@evolve/core';
import { initDatabase, type EvolveDatabaseInstance } from './connection.js';
import { EventService } from './events/service.js';
import { ProjectRepository } from './repositories/project.js';
import { SessionRepository } from './repositories/session.js';

describe('EventSystem Integration Tests', () => {
  let instance: EvolveDatabaseInstance;
  let eventService: EventService;
  const projectId = 'proj_test_events';
  const sessionId = 'sess_test_events';

  beforeEach(() => {
    instance = initDatabase({ path: ':memory:' });
    eventService = new EventService(instance.db);

    const projectRepo = new ProjectRepository(instance.db);
    const sessionRepo = new SessionRepository(instance.db);

    projectRepo.create({
      id: projectId,
      name: 'Test Project',
      path: '/tmp/test-project',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    sessionRepo.create({
      id: sessionId,
      projectId,
      goal: 'Test event system',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  afterEach(() => {
    instance.close();
  });

  it('validates payloads and rejects invalid events without persisting', () => {
    // Missing required 'arguments' property on tool_call
    expect(() => {
      eventService.publish(sessionId, 'tool_call', {
        toolCallId: 'call_1',
        toolName: 'fs_read',
      } as unknown as Parameters<typeof eventService.publish>[2]);
    }).toThrow(ValidationError);

    // Verify nothing was persisted
    const events = eventService.getSessionEvents(sessionId);
    expect(events).toHaveLength(0);
  });

  it('persists and retrieves all 11 supported events', () => {
    eventService.publish(sessionId, 'session_started', {
      goal: 'Test event system',
      workspaceRoot: '/tmp/test-project',
    });

    eventService.publish(sessionId, 'user_prompt', {
      prompt: 'Refactor database module',
    });

    eventService.publish(sessionId, 'assistant_response', {
      content: 'I will inspect the database schema.',
      model: 'qwen2.5-coder:7b',
    });

    eventService.publish(sessionId, 'tool_call', {
      toolCallId: 'call_1',
      toolName: 'fs_read',
      arguments: { path: 'packages/db/src/schema.ts' },
    });

    eventService.publish(sessionId, 'tool_result', {
      toolCallId: 'call_1',
      toolName: 'fs_read',
      output: 'export const events = ...',
      success: true,
    });

    eventService.publish(sessionId, 'command_execution', {
      commandId: 'cmd_1',
      command: 'pnpm test',
      cwd: '/tmp/test-project',
    });

    eventService.publish(sessionId, 'execution_result', {
      commandId: 'cmd_1',
      command: 'pnpm test',
      exitCode: 0,
      stdout: '10 passed',
      stderr: '',
      durationMs: 350,
    });

    eventService.publish(sessionId, 'human_feedback', {
      feedbackId: 'feed_1',
      feedbackType: 'human_review',
      rating: 5,
      notes: 'Clean execution',
    });

    eventService.publish(sessionId, 'solution_accepted', {
      summary: 'Task completed successfully',
      acceptedAt: Date.now(),
    });

    eventService.publish(sessionId, 'solution_rejected', {
      reason: 'Failed lint check',
      rejectedAt: Date.now(),
    });

    eventService.publish(sessionId, 'session_completed', {
      success: true,
      durationMs: 1200,
      summary: 'All 11 events tested',
    });

    const recorded = eventService.getSessionEvents(sessionId);
    expect(recorded).toHaveLength(11);
    expect(recorded.map((e) => e.type)).toEqual([
      'session_started',
      'user_prompt',
      'assistant_response',
      'tool_call',
      'tool_result',
      'command_execution',
      'execution_result',
      'human_feedback',
      'solution_accepted',
      'solution_rejected',
      'session_completed',
    ]);
  });

  it('guarantees strict chronological event ordering', () => {
    for (let i = 1; i <= 5; i++) {
      eventService.publish(sessionId, 'user_prompt', {
        prompt: `Prompt number ${i}`,
      });
    }

    const events = eventService.getSessionEvents(sessionId);
    expect(events).toHaveLength(5);

    // Verify monotonic ascending timestamps
    for (let i = 0; i < events.length - 1; i++) {
      expect(events[i]?.timestamp).toBeLessThanOrEqual(events[i + 1]?.timestamp ?? 0);
    }

    expect(events[0]?.payload.prompt).toBe('Prompt number 1');
    expect(events[4]?.payload.prompt).toBe('Prompt number 5');
  });

  it('filters events by type and session', () => {
    eventService.publish(sessionId, 'user_prompt', { prompt: 'User prompt 1' });
    eventService.publish(sessionId, 'tool_call', {
      toolCallId: 'call_1',
      toolName: 'fs_read',
      arguments: {},
    });
    eventService.publish(sessionId, 'user_prompt', { prompt: 'User prompt 2' });

    // Filter by type
    const promptEvents = eventService.filter({
      sessionId,
      types: ['user_prompt'],
    });
    expect(promptEvents).toHaveLength(2);
    expect(promptEvents.every((e) => e.type === 'user_prompt')).toBe(true);

    const toolEvents = eventService.filter({
      sessionId,
      types: ['tool_call'],
    });
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0]?.type).toBe('tool_call');
  });

  it('delivers events to subscribers and wildcard observers', () => {
    const specificHandler = vi.fn();
    const wildcardHandler = vi.fn();

    eventService.subscribeTo('session_started', specificHandler);
    const unsubscribeAll = eventService.subscribe(wildcardHandler);

    eventService.publish(sessionId, 'session_started', {
      goal: 'Check observer pattern',
      workspaceRoot: '/tmp',
    });

    expect(specificHandler).toHaveBeenCalledTimes(1);
    expect(wildcardHandler).toHaveBeenCalledTimes(1);

    unsubscribeAll();

    eventService.publish(sessionId, 'user_prompt', {
      prompt: 'Second prompt',
    });

    expect(specificHandler).toHaveBeenCalledTimes(1);
    expect(wildcardHandler).toHaveBeenCalledTimes(1); // Not called after unsubscribe
  });
});
