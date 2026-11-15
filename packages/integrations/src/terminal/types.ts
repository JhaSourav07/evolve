import type { SessionId } from '@evolve/core';

export interface TerminalSessionStartInput {
  sessionId: SessionId | string;
  goal: string;
  workspaceRoot: string;
  modelConfig?: Record<string, unknown>;
}

export interface TerminalSessionEndInput {
  sessionId: SessionId | string;
  success: boolean;
  durationMs: number;
  summary?: string;
  error?: string;
}

export interface TerminalPromptInput {
  sessionId: SessionId | string;
  prompt: string;
  cwd: string;
  context?: Record<string, unknown>;
}

export interface TerminalCommandInput {
  sessionId: SessionId | string;
  commandId: string;
  command: string;
  cwd: string;
  timeoutMs?: number;
}

export interface TerminalCommandResultInput {
  sessionId: SessionId | string;
  commandId: string;
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}
