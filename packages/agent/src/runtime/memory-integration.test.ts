import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDatabase, MemoryService, resetTestDatabase } from '@evolve/db';
import { MockModelProvider } from '../providers/mock.js';
import { AgentRuntime } from './agent.js';
import { ToolRegistry } from '../tools/registry.js';

describe('Experience Memory Integration with AgentRuntime', () => {
  let tmpDir: string;
  let closeDb: () => void;
  let memoryService: MemoryService;
  let provider: MockModelProvider;
  let tools: ToolRegistry;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-agent-memory-test-'));
    const { db, sqlite, close } = initDatabase({ path: path.join(tmpDir, 'test.db') });
    closeDb = close;
    resetTestDatabase(sqlite);
    memoryService = new MemoryService(db, sqlite);
    provider = new MockModelProvider();
    tools = new ToolRegistry();
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('retrieves previous experiences using FTS5 and injects them into a new coding task', async () => {
    // 1. Seed past experiences into SQLite FTS5 memory
    memoryService.saveExperience(
      'vitest_workspace_config',
      'When configuring vitest in a pnpm monorepo, define vitest.workspace.ts pointing to packages/*/vitest.config.ts.',
      { tags: ['vitest', 'workspace', 'monorepo', 'test', 'configuration'] },
    );

    memoryService.savePreference(
      'tooling.package_manager',
      'Always use pnpm workspace commands rather than npm.',
      { tags: ['pnpm', 'tooling'] },
    );

    // 2. A new coding task arrives
    const newPrompt = 'Please configure vitest for this monorepo';

    // 3. Retrieve relevant memories via SQLite FTS5 BM25 search
    const matchingMemories = memoryService.search(newPrompt);
    expect(matchingMemories.length).toBeGreaterThan(0);
    expect(matchingMemories[0]?.key).toBe('vitest_workspace_config');

    // 4. Mock model acknowledges and uses the retrieved memory
    provider.enqueueResponse({
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content:
          'I have retrieved your previous experience: creating vitest.workspace.ts with pnpm workspace packages.',
      },
    });

    const runtime = new AgentRuntime({
      provider,
      tools,
      config: {
        workspaceRoot: tmpDir,
      },
    });

    // 5. Run the new task, passing the retrieved memories
    const result = await runtime.run(newPrompt, {
      memories: matchingMemories,
    });

    expect(result.success).toBe(true);

    // 6. Verify that the system prompt provided to the model contained the retrieved experience
    const modelCalls = provider.getCalls();
    expect(modelCalls.length).toBe(1);

    const firstMessage = modelCalls[0]?.messages[0];
    expect(firstMessage?.role).toBe('system');
    expect(firstMessage?.content).toContain('Relevant Past Experiences & Project Preferences');
    expect(firstMessage?.content).toContain('vitest_workspace_config');
    expect(firstMessage?.content).toContain('define vitest.workspace.ts');
  });
});
