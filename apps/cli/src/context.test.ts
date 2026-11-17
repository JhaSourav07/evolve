import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliContext } from './context.js';

describe('CliContext', () => {
  let tempDir: string;
  let context: CliContext;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'evolve-cli-test-'));
    context = new CliContext({ rootDir: tempDir, dbPath: ':memory:' });
  });

  afterEach(() => {
    context.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('initializes context, registers project, and creates .evolve folder', () => {
    expect(context.rootDir).toBe(tempDir);
    expect(context.projectId).toBeDefined();

    const project = context.projectRepo.findById(context.projectId);
    expect(project).toBeDefined();
    expect(project?.path).toBe(tempDir);
  });

  it('creates sessions and emits session_started event into SQLite', () => {
    const sessionId = context.createSession('Test CLI Goal');
    expect(sessionId.startsWith('sess_')).toBe(true);

    const session = context.sessionRepo.findById(sessionId);
    expect(session).toBeDefined();
    expect(session?.goal).toBe('Test CLI Goal');

    const events = context.eventService.getSessionEvents(sessionId);
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('session_started');
  });

  it('injects stored memories into agent runtime prompt', () => {
    // Add memory
    context.memoryService.saveMemory('user_preference', 'indentation', 'Use 2 spaces', {
      projectId: context.projectId,
    });

    const sessionId = context.createSession('Refactor codebase');
    const runtime = context.createAgentRuntime(sessionId);
    expect(runtime).toBeDefined();
  });

  it('persists selected model and reloads it on subsequent context instances', () => {
    context.setModel('qwen3.5:9b');
    expect(context.getModel()).toBe('qwen3.5:9b');

    const sid = context.createSession('Selected Model Goal');
    const events = context.eventService.getSessionEvents(sid);
    expect(events[0]?.payload).toMatchObject({
      modelConfig: {
        model: 'qwen3.5:9b',
      },
    });

    // Close and create new context in same directory
    context.close();
    const freshContext = new CliContext({ rootDir: tempDir });
    expect(freshContext.getModel()).toBe('qwen3.5:9b');
    freshContext.close();
  });
});
