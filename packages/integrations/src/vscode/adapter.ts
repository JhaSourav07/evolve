import { BaseIntegrationAdapter } from '../common/base.js';
import type { IntegrationPublisher } from '../common/types.js';
import type { ConsentManager } from '../consent/manager.js';
import type {
  VSCodeAssistantResponse,
  VSCodeChatFeedback,
  VSCodeChatPrompt,
  VSCodeCodeAction,
  VSCodeCodeActionResult,
  VSCodeSolutionFeedback,
} from './types.js';

export class VSCodeAdapter extends BaseIntegrationAdapter {
  constructor(consentManager: ConsentManager, publisher?: IntegrationPublisher) {
    super('vscode', consentManager, publisher);
  }

  public handleChatPrompt(input: VSCodeChatPrompt) {
    if (input.workspaceFolder) {
      this.consentManager.validateWorkspace(input.workspaceFolder);
    }
    return this.publishIntegrated(
      input.sessionId,
      'user_prompt',
      {
        prompt: input.prompt,
        context: {
          activeFile: input.activeFile,
          selection: input.selection,
          workspaceFolder: input.workspaceFolder,
        },
      },
      {
        scope: 'workspace_only',
        customMetadata: {
          activeFile: input.activeFile,
        },
      },
    );
  }

  public handleAssistantResponse(input: VSCodeAssistantResponse) {
    return this.publishIntegrated(
      input.sessionId,
      'assistant_response',
      {
        content: input.content,
        model: input.model,
        finishReason: input.finishReason,
      },
      { scope: 'workspace_only' },
    );
  }

  public handleCodeAction(input: VSCodeCodeAction) {
    return this.publishIntegrated(
      input.sessionId,
      'tool_call',
      {
        toolCallId: input.toolCallId,
        toolName: 'edit_file',
        arguments: {
          actionTitle: input.actionTitle,
          filePath: input.filePath,
          ...input.edits,
        },
      },
      {
        scope: 'workspace_only',
        originalId: input.toolCallId,
        customMetadata: { filePath: input.filePath },
      },
    );
  }

  public handleCodeActionResult(input: VSCodeCodeActionResult) {
    return this.publishIntegrated(
      input.sessionId,
      'tool_result',
      {
        toolCallId: input.toolCallId,
        toolName: 'edit_file',
        success: input.success,
        output: input.output,
        error: input.error,
      },
      {
        scope: 'workspace_only',
        originalId: input.toolCallId,
      },
    );
  }

  public handleSolutionFeedback(input: VSCodeSolutionFeedback) {
    if (input.decision === 'accepted') {
      return this.publishIntegrated(
        input.sessionId,
        'solution_accepted',
        {
          summary: input.summaryOrReason,
          acceptedAt: Date.now(),
          filesChanged: input.filesChanged,
        },
        { scope: 'workspace_only' },
      );
    } else {
      return this.publishIntegrated(
        input.sessionId,
        'solution_rejected',
        {
          reason: input.summaryOrReason,
          rejectedAt: Date.now(),
          feedback: input.feedbackNotes,
        },
        { scope: 'workspace_only' },
      );
    }
  }

  public handleChatFeedback(input: VSCodeChatFeedback) {
    return this.publishIntegrated(
      input.sessionId,
      'human_feedback',
      {
        feedbackId: input.feedbackId,
        feedbackType: 'vscode_chat',
        rating: input.rating,
        notes: input.notes,
        toolCallId: input.toolCallId,
      },
      {
        scope: 'workspace_only',
        originalId: input.feedbackId,
      },
    );
  }
}
