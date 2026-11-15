import type { SessionId } from '@evolve/core';

export interface PiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  model?: string;
  timestamp?: number;
}

export interface PiToolCall {
  callId: string;
  name: string;
  args: Record<string, unknown>;
}

export interface PiToolResult {
  callId: string;
  name: string;
  success: boolean;
  result?: string;
  error?: string;
}

export interface PiFeedback {
  feedbackId: string;
  value: 'up' | 'down' | 'neutral';
  text?: string;
  toolCallId?: string;
}

export interface PiSessionState {
  sessionId: SessionId | string;
  title: string;
  workspaceRoot?: string;
}
