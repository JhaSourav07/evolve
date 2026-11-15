import { describe, expect, it } from 'vitest';
import { SecurityError } from '@evolve/core';
import { ConsentManager } from '../consent/manager.js';
import { VSCodeAdapter } from './adapter.js';

describe('VSCodeAdapter', () => {
  it('enforces consent policy for editor capture', () => {
    const consent = new ConsentManager();
    const adapter = new VSCodeAdapter(consent);

    expect(() =>
      adapter.handleChatPrompt({
        sessionId: 'sess_vs_1',
        prompt: 'Explain this function',
      }),
    ).toThrow(SecurityError);
  });

  it('handles chat prompts, assistant responses, code actions, and feedback', () => {
    const consent = new ConsentManager({
      allowVSCodeCollection: true,
      allowedWorkspaceRoots: ['/workspace/code'],
    });
    const adapter = new VSCodeAdapter(consent);

    // 1. Chat prompt with active file & selection context
    const promptEv = adapter.handleChatPrompt({
      sessionId: 'sess_vs_1',
      prompt: 'Refactor this loop',
      activeFile: '/workspace/code/main.ts',
      selection: 'for (let i = 0; i < n; i++)',
      workspaceFolder: '/workspace/code',
    });
    expect(promptEv.type).toBe('user_prompt');
    expect(promptEv.attribution.source).toBe('vscode');
    expect(promptEv.payload.context?.activeFile).toBe('/workspace/code/main.ts');

    // 2. Assistant response
    const respEv = adapter.handleAssistantResponse({
      sessionId: 'sess_vs_1',
      content: 'You can use array.map(...)',
    });
    expect(respEv.type).toBe('assistant_response');

    // 3. Code action applied (tool_call)
    const actionEv = adapter.handleCodeAction({
      sessionId: 'sess_vs_1',
      toolCallId: 'action_42',
      actionTitle: 'Convert to map',
      filePath: '/workspace/code/main.ts',
      edits: { startLine: 10, endLine: 12 },
    });
    expect(actionEv.type).toBe('tool_call');
    expect(actionEv.payload.toolName).toBe('edit_file');
    expect(actionEv.attribution.originalId).toBe('action_42');

    // 4. Code action result (tool_result)
    const resultEv = adapter.handleCodeActionResult({
      sessionId: 'sess_vs_1',
      toolCallId: 'action_42',
      actionTitle: 'Convert to map',
      success: true,
      output: 'Applied edits',
    });
    expect(resultEv.type).toBe('tool_result');
    expect(resultEv.payload.success).toBe(true);

    // 5. Solution accepted
    const acceptedEv = adapter.handleSolutionFeedback({
      sessionId: 'sess_vs_1',
      decision: 'accepted',
      summaryOrReason: 'Applied refactoring successfully',
      filesChanged: ['/workspace/code/main.ts'],
    });
    expect(acceptedEv.type).toBe('solution_accepted');

    // 6. User thumbs-up in chat
    const fbEv = adapter.handleChatFeedback({
      sessionId: 'sess_vs_1',
      feedbackId: 'fb_vs_1',
      rating: 1,
      notes: 'Clean refactor',
    });
    expect(fbEv.type).toBe('human_feedback');
    expect(fbEv.payload.rating).toBe(1);
    expect(fbEv.payload.feedbackType).toBe('vscode_chat');
  });
});
