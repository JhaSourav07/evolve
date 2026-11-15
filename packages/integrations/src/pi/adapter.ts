import type { SessionId } from '@evolve/core';
import { BaseIntegrationAdapter } from '../common/base.js';
import type { IntegrationPublisher } from '../common/types.js';
import type { ConsentManager } from '../consent/manager.js';
import type { PiFeedback, PiMessage, PiSessionState, PiToolCall, PiToolResult } from './types.js';

export class PiAdapter extends BaseIntegrationAdapter {
  constructor(consentManager: ConsentManager, publisher?: IntegrationPublisher) {
    super('pi', consentManager, publisher);
  }

  public handleSessionStart(input: PiSessionState) {
    if (input.workspaceRoot) {
      this.consentManager.validateWorkspace(input.workspaceRoot);
    }
    return this.publishIntegrated(
      input.sessionId,
      'session_started',
      {
        goal: input.title,
        workspaceRoot: input.workspaceRoot ?? process.cwd(),
      },
      { scope: 'session_only' },
    );
  }

  public handleUserMessage(sessionId: SessionId | string, message: PiMessage) {
    return this.publishIntegrated(
      sessionId,
      'user_prompt',
      {
        prompt: message.text,
      },
      {
        scope: 'session_only',
        originalId: message.id,
      },
    );
  }

  public handleAssistantMessage(sessionId: SessionId | string, message: PiMessage) {
    return this.publishIntegrated(
      sessionId,
      'assistant_response',
      {
        content: message.text,
        model: message.model,
      },
      {
        scope: 'session_only',
        originalId: message.id,
      },
    );
  }

  public handleToolCall(sessionId: SessionId | string, call: PiToolCall) {
    return this.publishIntegrated(
      sessionId,
      'tool_call',
      {
        toolCallId: call.callId,
        toolName: call.name,
        arguments: call.args,
      },
      {
        scope: 'session_only',
        originalId: call.callId,
      },
    );
  }

  public handleToolResult(sessionId: SessionId | string, result: PiToolResult) {
    return this.publishIntegrated(
      sessionId,
      'tool_result',
      {
        toolCallId: result.callId,
        toolName: result.name,
        success: result.success,
        output: result.result,
        error: result.error,
      },
      {
        scope: 'session_only',
        originalId: result.callId,
      },
    );
  }

  public handleFeedback(sessionId: SessionId | string, feedback: PiFeedback) {
    const ratingMap: Record<PiFeedback['value'], number> = {
      up: 1,
      down: -1,
      neutral: 0,
    };

    return this.publishIntegrated(
      sessionId,
      'human_feedback',
      {
        feedbackId: feedback.feedbackId,
        feedbackType: 'pi_assistant',
        rating: ratingMap[feedback.value],
        notes: feedback.text,
        toolCallId: feedback.toolCallId,
      },
      {
        scope: 'session_only',
        originalId: feedback.feedbackId,
      },
    );
  }
}
