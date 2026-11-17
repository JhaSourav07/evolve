import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runExecuteCommand } from './commands/run.js';
import { CliContext } from './context.js';
import { buildCli } from './index.js';

describe('Run Command Tests', () => {
  let tempDir: string;
  let context: CliContext;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'evolve-run-cmd-test-'));
    context = new CliContext({ rootDir: tempDir });
  });

  afterEach(() => {
    context.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('buildCli registers the run command with appropriate options', () => {
    const cli = buildCli();
    const runCmd = cli.commands.find((c) => c.name() === 'run');
    expect(runCmd).toBeDefined();
    expect(runCmd?.description()).toContain('Execute an approved implementation plan');

    const options = runCmd?.options.map((o) => o.long);
    expect(options).toContain('--auto-approve');
    expect(options).toContain('--no-verify');
    expect(options).toContain('--test-command');
    expect(options).toContain('--headless');
    expect(options).toContain('--model');
  });

  it('runExecuteCommand reports error when specified plan is not found', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runExecuteCommand('missing_plan_id', { headless: true, rootDir: tempDir });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Plan not found with ID: missing_plan_id'),
    );

    consoleErrorSpy.mockRestore();
  });

  it('runExecuteCommand reports when no plans exist in headless mode', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runExecuteCommand(undefined, { headless: true, rootDir: tempDir });

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('No implementation plans found to execute'),
    );

    consoleLogSpy.mockRestore();
  });
});
