import { describe, expect, it } from 'vitest';
import { SecurityError } from '@evolve/core';
import { ConsentManager } from '../consent/manager.js';
import { TerminalAdapter } from './adapter.js';

describe('TerminalAdapter', () => {
  it('throws SecurityError if terminal consent is not granted', () => {
    const consent = new ConsentManager();
    const adapter = new TerminalAdapter(consent);

    expect(() =>
      adapter.captureCommand({
        sessionId: 'sess_1',
        commandId: 'cmd_1',
        command: 'npm test',
        cwd: '/repo',
      }),
    ).toThrow(SecurityError);
  });

  it('captures terminal commands, executions, and prompts when consented', () => {
    const consent = new ConsentManager({
      allowTerminalCollection: true,
      allowedWorkspaceRoots: ['/workspace/app'],
    });
    const adapter = new TerminalAdapter(consent);

    // 1. Session start
    const startEv = adapter.startSession({
      sessionId: 'sess_term_1',
      goal: 'Run test suite',
      workspaceRoot: '/workspace/app',
    });
    expect(startEv.type).toBe('session_started');
    expect(startEv.attribution.source).toBe('terminal');

    // 2. Command execution
    const cmdEv = adapter.captureCommand({
      sessionId: 'sess_term_1',
      commandId: 'cmd_101',
      command: 'pnpm test',
      cwd: '/workspace/app',
    });
    expect(cmdEv.type).toBe('command_execution');
    expect(cmdEv.payload.command).toBe('pnpm test');
    expect(cmdEv.attribution.originalId).toBe('cmd_101');

    // 3. Execution result
    const resEv = adapter.captureResult({
      sessionId: 'sess_term_1',
      commandId: 'cmd_101',
      command: 'pnpm test',
      cwd: '/workspace/app',
      exitCode: 0,
      stdout: 'PASS 12 tests',
      stderr: '',
      durationMs: 1450,
    });
    expect(resEv.type).toBe('execution_result');
    expect(resEv.payload.exitCode).toBe(0);
    expect(resEv.payload.durationMs).toBe(1450);

    // 4. Session end
    const endEv = adapter.endSession({
      sessionId: 'sess_term_1',
      success: true,
      durationMs: 2000,
      summary: 'All tests passed',
    });
    expect(endEv.type).toBe('session_completed');
  });

  it('rejects commands executed outside authorized workspace', () => {
    const consent = new ConsentManager({
      allowTerminalCollection: true,
      allowedWorkspaceRoots: ['/workspace/app'],
    });
    const adapter = new TerminalAdapter(consent);

    expect(() =>
      adapter.captureCommand({
        sessionId: 'sess_1',
        commandId: 'cmd_bad',
        command: 'cat /etc/passwd',
        cwd: '/etc',
      }),
    ).toThrow(SecurityError);
  });
});
