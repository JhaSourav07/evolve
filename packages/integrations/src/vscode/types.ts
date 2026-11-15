import type { SessionId } from '@evolve/core';

export interface VSCodeChatPrompt {
  sessionId: SessionId | string;
  prompt: string;
  activeFile?: string;
  selection?: string;
  workspaceFolder?: string;
}

export interface VSCodeAssistantResponse {
  sessionId: SessionId | string;
  content: string;
  model?: string;
  finishReason?: string;
}

export interface VSCodeCodeAction {
  sessionId: SessionId | string;
  toolCallId: string;
  actionTitle: string;
  filePath: string;
  edits: Record<string, unknown>;
}

export interface VSCodeCodeActionResult {
  sessionId: SessionId | string;
  toolCallId: string;
  actionTitle: string;
  success: boolean;
  output?: string;
  error?: string;
}

export interface VSCodeSolutionFeedback {
  sessionId: SessionId | string;
  decision: 'accepted' | 'rejected';
  summaryOrReason: string;
  filesChanged?: string[];
  feedbackNotes?: string;
}

export interface VSCodeChatFeedback {
  sessionId: SessionId | string;
  feedbackId: string;
  rating: number; // -1, 0, 1
  notes?: string;
  toolCallId?: string;
}
