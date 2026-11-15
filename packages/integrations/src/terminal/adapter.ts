import { BaseIntegrationAdapter } from '../common/base.js';
import type { IntegrationPublisher } from '../common/types.js';
import type { ConsentManager } from '../consent/manager.js';
import type {
  TerminalCommandInput,
  TerminalCommandResultInput,
  TerminalPromptInput,
  TerminalSessionEndInput,
  TerminalSessionStartInput,
} from './types.js';

export class TerminalAdapter extends BaseIntegrationAdapter {
  constructor(consentManager: ConsentManager, publisher?: IntegrationPublisher) {
    super('terminal', consentManager, publisher);
  }

  public startSession(input: TerminalSessionStartInput) {
    this.consentManager.validateWorkspace(input.workspaceRoot);
    return this.publishIntegrated(
      input.sessionId,
      'session_started',
      {
        goal: input.goal,
        workspaceRoot: input.workspaceRoot,
        modelConfig: input.modelConfig,
      },
      { scope: 'workspace_only' },
    );
  }

  public endSession(input: TerminalSessionEndInput) {
    return this.publishIntegrated(
      input.sessionId,
      'session_completed',
      {
        success: input.success,
        durationMs: input.durationMs,
        summary: input.summary,
        error: input.error,
      },
      { scope: 'workspace_only' },
    );
  }

  public capturePrompt(input: TerminalPromptInput) {
    this.consentManager.validateWorkspace(input.cwd);
    return this.publishIntegrated(
      input.sessionId,
      'user_prompt',
      {
        prompt: input.prompt,
        context: {
          cwd: input.cwd,
          ...input.context,
        },
      },
      {
        scope: 'explicit_command',
        customMetadata: { cwd: input.cwd },
      },
    );
  }

  public captureCommand(input: TerminalCommandInput) {
    this.consentManager.validateWorkspace(input.cwd);
    return this.publishIntegrated(
      input.sessionId,
      'command_execution',
      {
        commandId: input.commandId,
        command: input.command,
        cwd: input.cwd,
        timeoutMs: input.timeoutMs,
      },
      {
        scope: 'explicit_command',
        originalId: input.commandId,
        customMetadata: { cwd: input.cwd },
      },
    );
  }

  public captureResult(input: TerminalCommandResultInput) {
    this.consentManager.validateWorkspace(input.cwd);
    return this.publishIntegrated(
      input.sessionId,
      'execution_result',
      {
        commandId: input.commandId,
        command: input.command,
        exitCode: input.exitCode,
        stdout: input.stdout,
        stderr: input.stderr,
        durationMs: input.durationMs,
      },
      {
        scope: 'explicit_command',
        originalId: input.commandId,
        customMetadata: {
          cwd: input.cwd,
          exitCode: input.exitCode,
        },
      },
    );
  }
}
