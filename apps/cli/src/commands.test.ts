import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runConfigCommand } from './commands/config.js';
import { runFeedbackCommand } from './commands/feedback.js';
import { runInitCommand } from './commands/init.js';
import { runMemoryCommand } from './commands/memory.js';
import { CliContext } from './context.js';

describe('CLI Commands Unit Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'evolve-cmd-test-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('runInitCommand initializes .evolve directory and config.json', async () => {
    await runInitCommand({ rootDir: tempDir });

    const context = new CliContext({ rootDir: tempDir });
    expect(context.projectRepo.findById(context.projectId)).toBeDefined();
    context.close();
  });

  it('runConfigCommand runs without throwing', async () => {
    await expect(runConfigCommand()).resolves.not.toThrow();
  });

  it('runMemoryCommand adds and inspects memory entries', async () => {
    await runMemoryCommand({
      add: true,
      category: 'project_rule',
      key: 'testing_framework',
      content: 'Always use Vitest with strict assertions',
    });

    await expect(runMemoryCommand()).resolves.not.toThrow();
  });

  it('runFeedbackCommand records and retrieves feedback', async () => {
    const context = new CliContext();
    const sid = context.createSession('Test Feedback Session');

    context.feedbackService.record({
      sessionId: sid,
      targetType: 'response',
      rating: 1,
      notes: 'Super clean',
      isTechnicallyCorrect: true,
    });
    context.close();

    await expect(runFeedbackCommand()).resolves.not.toThrow();
  });
});
