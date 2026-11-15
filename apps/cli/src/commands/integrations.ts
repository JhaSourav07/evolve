import { existsSync, readFileSync } from 'node:fs';
import React from 'react';
import { render } from 'ink';
import { ClaudeImporter, GeminiImporter } from '@evolve/integrations';
import { IntegrationsList, type IntegrationStatusItem } from '../components/IntegrationsList.js';
import { CliContext } from '../context.js';
import { Theme } from '../components/Theme.js';

export async function runIntegrationsCommand(options?: {
  importFile?: string | undefined;
}): Promise<void> {
  const context = new CliContext();

  if (options?.importFile) {
    const filePath = options.importFile;
    if (!existsSync(filePath)) {
      console.error(`\n${Theme.icons.cross} Error: file not found at "${filePath}"\n`);
      context.close();
      process.exit(1);
    }

    try {
      const content = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);

      const isGemini =
        filePath.toLowerCase().includes('gemini') ||
        (Array.isArray(parsed) && parsed[0]?.messages?.[0]?.parts);
      const importer = isGemini
        ? new GeminiImporter(context.consentManager, context.eventService)
        : new ClaudeImporter(context.consentManager, context.eventService);

      console.log(`\n${Theme.icons.sparkle} Importing external conversations from ${filePath}...`);
      const result = importer.importConversations(parsed, { workspaceRoot: context.rootDir });

      for (const sess of result.sessions) {
        // Register session in project
        context.sessionRepo.create({
          id: sess.sessionId,
          projectId: context.projectId,
          goal: sess.title,
          status: 'completed',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      console.log(`  ${Theme.icons.check} Imported ${result.sessions.length} sessions`);
      console.log(
        `  ${Theme.icons.check} Dispatched & persisted ${result.events.length} normalized Evolve events to SQLite`,
      );
      console.log(`\n${Theme.icons.check} Import completed successfully!\n`);
    } catch (err: unknown) {
      console.error(
        `\n${Theme.icons.cross} Import failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    } finally {
      context.close();
    }
    return;
  }

  const items: IntegrationStatusItem[] = [
    {
      id: 'terminal',
      name: 'Terminal Integration',
      source: 'terminal',
      consentGranted: context.consentManager.hasConsent('terminal'),
      scope: 'explicit_command',
      description: 'Captures developer commands, outputs, and exit codes within project boundary.',
    },
    {
      id: 'vscode',
      name: 'VS Code Extension',
      source: 'vscode',
      consentGranted: context.consentManager.hasConsent('vscode'),
      scope: 'workspace_only',
      description: 'Captures editor chat prompts, code actions, and diff feedback.',
    },
    {
      id: 'pi',
      name: 'Pi Coding Agent',
      source: 'pi',
      consentGranted: context.consentManager.hasConsent('pi'),
      scope: 'session_only',
      description: 'Normalizes interactive streams and tool calls from Pi assistant.',
    },
    {
      id: 'claude',
      name: 'Claude Conversation Import',
      source: 'claude_import',
      consentGranted: context.consentManager.hasConsent('claude_import'),
      scope: 'explicit_file_import',
      description: 'Imports Anthropic Claude.ai conversation exports (conversations.json).',
    },
    {
      id: 'gemini',
      name: 'Gemini Conversation Import',
      source: 'gemini_import',
      consentGranted: context.consentManager.hasConsent('gemini_import'),
      scope: 'explicit_file_import',
      description: 'Imports Google AI Studio / Google Takeout conversation JSON archives.',
    },
  ];

  const app = render(React.createElement(IntegrationsList, { items }), {
    patchConsole: false,
  });
  app.unmount();
  context.close();
}
