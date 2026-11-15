import type { SessionId } from '@evolve/core';
import { BaseIntegrationAdapter } from '../common/base.js';
import type { IntegrationPublisher } from '../common/types.js';
import type { ConsentManager } from '../consent/manager.js';

export class NativeEventAdapter extends BaseIntegrationAdapter {
  constructor(consentManager: ConsentManager, publisher?: IntegrationPublisher) {
    super('evolve_native', consentManager, publisher);
  }

  public recordSessionStarted(
    sessionId: SessionId | string,
    goal: string,
    workspaceRoot: string,
    modelConfig?: Record<string, unknown>,
  ) {
    return this.publishIntegrated(sessionId, 'session_started', {
      goal,
      workspaceRoot,
      modelConfig,
    });
  }

  public recordSessionCompleted(
    sessionId: SessionId | string,
    success: boolean,
    durationMs: number,
    summary?: string,
    error?: string,
  ) {
    return this.publishIntegrated(sessionId, 'session_completed', {
      success,
      durationMs,
      summary,
      error,
    });
  }

  public recordUserPrompt(
    sessionId: SessionId | string,
    prompt: string,
    context?: Record<string, unknown>,
  ) {
    return this.publishIntegrated(sessionId, 'user_prompt', {
      prompt,
      context,
    });
  }

  public recordAssistantResponse(
    sessionId: SessionId | string,
    content: string,
    model?: string,
    finishReason?: string,
  ) {
    return this.publishIntegrated(sessionId, 'assistant_response', {
      content,
      model,
      finishReason,
    });
  }

  public recordToolCall(
    sessionId: SessionId | string,
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) {
    return this.publishIntegrated(sessionId, 'tool_call', {
      toolCallId,
      toolName,
      arguments: args,
    });
  }

  public recordToolResult(
    sessionId: SessionId | string,
    toolCallId: string,
    toolName: string,
    success: boolean,
    output?: string,
    error?: string,
  ) {
    return this.publishIntegrated(sessionId, 'tool_result', {
      toolCallId,
      toolName,
      success,
      output,
      error,
    });
  }

  public recordCommandExecution(
    sessionId: SessionId | string,
    commandId: string,
    command: string,
    cwd: string,
    timeoutMs?: number,
  ) {
    return this.publishIntegrated(sessionId, 'command_execution', {
      commandId,
      command,
      cwd,
      timeoutMs,
    });
  }

  public recordExecutionResult(
    sessionId: SessionId | string,
    commandId: string,
    command: string,
    exitCode: number,
    stdout: string,
    stderr: string,
    durationMs: number,
  ) {
    return this.publishIntegrated(sessionId, 'execution_result', {
      commandId,
      command,
      exitCode,
      stdout,
      stderr,
      durationMs,
    });
  }

  public recordHumanFeedback(
    sessionId: SessionId | string,
    feedbackId: string,
    feedbackType: string,
    rating?: number,
    notes?: string,
    toolCallId?: string,
  ) {
    return this.publishIntegrated(sessionId, 'human_feedback', {
      feedbackId,
      feedbackType,
      rating,
      notes,
      toolCallId,
    });
  }

  public recordSolutionAccepted(
    sessionId: SessionId | string,
    summary: string,
    acceptedAt: number = Date.now(),
    filesChanged?: string[],
  ) {
    return this.publishIntegrated(sessionId, 'solution_accepted', {
      summary,
      acceptedAt,
      filesChanged,
    });
  }

  public recordSolutionRejected(
    sessionId: SessionId | string,
    reason: string,
    rejectedAt: number = Date.now(),
    feedback?: string,
  ) {
    return this.publishIntegrated(sessionId, 'solution_rejected', {
      reason,
      rejectedAt,
      feedback,
    });
  }
}
