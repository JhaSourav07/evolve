import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runMemoryCommand } from './commands/memory.js';
import { CliContext } from './context.js';

describe('CLI Memory Commands', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'evolve-mem-cmd-test-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('adds and lists user preferences and project rules', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // 1. Add user preference
    await runMemoryCommand({
      subcommand: 'add',
      args: ['user_preference', 'tooling.packager', 'Always use pnpm'],
    });

    // 2. Add project rule
    await runMemoryCommand({
      subcommand: 'add',
      args: ['project_rule', 'arch.db', 'SQLite in WAL mode'],
    });

    // 3. List
    await expect(runMemoryCommand({ subcommand: 'list' })).resolves.not.toThrow();

    // 4. User preferences list
    await expect(runMemoryCommand({ subcommand: 'user' })).resolves.not.toThrow();

    // 5. Project rules list
    await expect(runMemoryCommand({ subcommand: 'project' })).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('searches memories using FTS5 keyword matching', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runMemoryCommand({
      subcommand: 'add',
      args: ['experience', 'vitest_pnpm', 'Configure vitest.workspace.ts for pnpm monorepo'],
    });

    await expect(
      runMemoryCommand({
        subcommand: 'search',
        args: ['vitest', 'workspace'],
      }),
    ).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('supports review, approve, deprecate, and delete lifecycle', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Add proposed memory
    const ctx = new CliContext();
    const proposed = ctx.memoryService.saveMemory(
      'architecture_decision',
      'arch.draft',
      'Draft decision for review',
      {
        projectId: ctx.projectId,
        verificationStatus: 'proposed',
      },
    );
    ctx.close();

    // Review
    await expect(runMemoryCommand({ subcommand: 'review' })).resolves.not.toThrow();

    // Inspect
    await runMemoryCommand({ subcommand: 'inspect', args: [proposed.id] });

    // Approve
    await runMemoryCommand({ subcommand: 'approve', args: [proposed.id] });

    const ctx2 = new CliContext();
    const approved = ctx2.memoryService.findById(proposed.id);
    expect(approved?.verificationStatus).toBe('verified');
    ctx2.close();

    // Deprecate
    await runMemoryCommand({ subcommand: 'deprecate', args: [proposed.id] });
    const ctx3 = new CliContext();
    const deprecated = ctx3.memoryService.findById(proposed.id);
    expect(deprecated?.verificationStatus).toBe('deprecated');
    ctx3.close();

    // Delete
    await runMemoryCommand({ subcommand: 'delete', args: [proposed.id] });
    const ctx4 = new CliContext();
    const deleted = ctx4.memoryService.findById(proposed.id);
    expect(deleted).toBeUndefined();
    ctx4.close();

    logSpy.mockRestore();
  });
});
