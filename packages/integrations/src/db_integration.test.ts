import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  initDatabase,
  ProjectRepository,
  SessionRepository,
  EventService,
  type EvolveDatabaseInstance,
} from '@evolve/db';
import { ConsentManager } from './consent/manager.js';
import { ClaudeImporter } from './importers/claude.js';
import { TerminalAdapter } from './terminal/adapter.js';

describe('Integrations <-> Database EventService End-to-End', () => {
  let instance: EvolveDatabaseInstance;
  let eventService: EventService;
  let sessionRepo: SessionRepository;
  let consent: ConsentManager;

  const projectId = 'proj_integration_test';
  const terminalSessionId = 'sess_term_db';
  const claudeSessionId = 'sess_claude_claude-db-1';

  beforeEach(() => {
    instance = initDatabase({ path: ':memory:' });
    eventService = new EventService(instance.db);

    const projectRepo = new ProjectRepository(instance.db);
    sessionRepo = new SessionRepository(instance.db);

    projectRepo.create({
      id: projectId,
      name: 'Integration Test Project',
      path: process.cwd(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    sessionRepo.create({
      id: terminalSessionId,
      projectId,
      goal: 'Compile TypeScript',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    sessionRepo.create({
      id: claudeSessionId,
      projectId,
      goal: 'Optimize Query',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    consent = new ConsentManager({
      allowTerminalCollection: true,
      allowVSCodeCollection: true,
      allowClaudeImport: true,
      allowGeminiImport: true,
      allowedWorkspaceRoots: [process.cwd()],
    });
  });

  afterEach(() => {
    instance.close();
  });

  it('persists terminal session and command events to SQLite through EventService', () => {
    const terminal = new TerminalAdapter(consent, eventService);

    terminal.startSession({
      sessionId: terminalSessionId,
      goal: 'Compile TypeScript',
      workspaceRoot: process.cwd(),
    });

    terminal.captureCommand({
      sessionId: terminalSessionId,
      commandId: 'cmd_tsc',
      command: 'pnpm run build',
      cwd: process.cwd(),
    });

    terminal.captureResult({
      sessionId: terminalSessionId,
      commandId: 'cmd_tsc',
      command: 'pnpm run build',
      cwd: process.cwd(),
      exitCode: 0,
      stdout: 'Done',
      stderr: '',
      durationMs: 800,
    });

    terminal.endSession({
      sessionId: terminalSessionId,
      success: true,
      durationMs: 1200,
    });

    // Verify stored events in SQLite
    const stored = eventService.getSessionEvents(terminalSessionId);
    expect(stored.length).toBe(4);
    expect(stored.map((e) => e.type)).toEqual([
      'session_started',
      'command_execution',
      'execution_result',
      'session_completed',
    ]);
  });

  it('persists imported Claude conversation into SQLite', () => {
    const claude = new ClaudeImporter(consent, eventService);

    const result = claude.importConversations([
      {
        uuid: 'claude-db-1',
        name: 'Optimize Query',
        chat_messages: [
          {
            uuid: 'cmsg-1',
            sender: 'human',
            text: 'How to speed up SQLite?',
          },
          {
            uuid: 'cmsg-2',
            sender: 'assistant',
            text: 'Use PRAGMA synchronous = NORMAL and WAL mode.',
          },
        ],
      },
    ]);

    expect(result.sessions.length).toBe(1);
    const sessionId = result.sessions[0].sessionId;
    expect(sessionId).toBe(claudeSessionId);

    const stored = eventService.getSessionEvents(sessionId);
    expect(stored.length).toBe(4);
    expect(stored.map((e) => e.type)).toEqual([
      'session_started',
      'user_prompt',
      'assistant_response',
      'session_completed',
    ]);
  });
});
