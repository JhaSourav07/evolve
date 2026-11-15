import { z } from 'zod';
import type { SessionId } from '@evolve/core';
import { BaseIntegrationAdapter } from '../common/base.js';
import type { IntegratedEventEnvelope, IntegrationPublisher } from '../common/types.js';
import type { ConsentManager } from '../consent/manager.js';

const ClaudeMessageSchema = z.object({
  uuid: z.string().min(1),
  sender: z.enum(['human', 'assistant']),
  text: z.string().default(''),
  created_at: z.string().optional(),
  tool_use: z
    .object({
      id: z.string(),
      name: z.string(),
      input: z.record(z.string(), z.unknown()).default({}),
    })
    .optional(),
  tool_result: z
    .object({
      id: z.string(),
      name: z.string().optional(),
      content: z.string().default(''),
      is_error: z.boolean().default(false),
    })
    .optional(),
});

const ClaudeConversationSchema = z.object({
  uuid: z.string().min(1),
  name: z.string().default('Claude Conversation'),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  chat_messages: z.array(ClaudeMessageSchema).default([]),
});

const ClaudeExportSchema = z.union([z.array(ClaudeConversationSchema), ClaudeConversationSchema]);

export interface ImportedSession {
  sessionId: SessionId;
  title: string;
  originalId: string;
  eventCount: number;
}

export class ClaudeImporter extends BaseIntegrationAdapter {
  constructor(consentManager: ConsentManager, publisher?: IntegrationPublisher) {
    super('claude_import', consentManager, publisher);
  }

  public importConversations(
    rawInput: string | unknown,
    options?: { workspaceRoot?: string },
  ): { sessions: ImportedSession[]; events: IntegratedEventEnvelope[] } {
    // 1. Verify consent
    this.consentManager.assertConsent('claude_import', 'explicit_file_import');

    const parsedRaw = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    const validation = ClaudeExportSchema.safeParse(parsedRaw);
    if (!validation.success) {
      throw new Error(`Invalid Claude export format: ${validation.error.message}`);
    }

    const conversations = Array.isArray(validation.data) ? validation.data : [validation.data];

    const importedSessions: ImportedSession[] = [];
    const allEvents: IntegratedEventEnvelope[] = [];
    const workspaceRoot = options?.workspaceRoot ?? process.cwd();

    for (const conv of conversations) {
      const sessionId = `sess_claude_${conv.uuid}` as SessionId;
      const sessionEvents: IntegratedEventEnvelope[] = [];

      // Session start
      const startEv = this.publishIntegrated(
        sessionId,
        'session_started',
        {
          goal: conv.name,
          workspaceRoot,
        },
        {
          scope: 'explicit_file_import',
          originalId: conv.uuid,
          customMetadata: {
            sourceSystem: 'claude.ai',
            createdAt: conv.created_at,
          },
        },
      );
      sessionEvents.push(startEv);

      // Sort messages chronologically
      const sortedMessages = [...conv.chat_messages].sort((a, b) => {
        if (!a.created_at || !b.created_at) return 0;
        return Date.parse(a.created_at) - Date.parse(b.created_at);
      });

      for (const msg of sortedMessages) {
        if (msg.sender === 'human') {
          const userPromptText = msg.text.trim() || '(Attachment)';
          const promptEv = this.publishIntegrated(
            sessionId,
            'user_prompt',
            { prompt: userPromptText },
            {
              scope: 'explicit_file_import',
              originalId: msg.uuid,
            },
          );
          sessionEvents.push(promptEv);
        } else if (msg.sender === 'assistant') {
          if (msg.text.trim()) {
            const respEv = this.publishIntegrated(
              sessionId,
              'assistant_response',
              { content: msg.text },
              {
                scope: 'explicit_file_import',
                originalId: msg.uuid,
              },
            );
            sessionEvents.push(respEv);
          }

          if (msg.tool_use) {
            const toolCallEv = this.publishIntegrated(
              sessionId,
              'tool_call',
              {
                toolCallId: msg.tool_use.id,
                toolName: msg.tool_use.name,
                arguments: msg.tool_use.input,
              },
              {
                scope: 'explicit_file_import',
                originalId: msg.tool_use.id,
              },
            );
            sessionEvents.push(toolCallEv);
          }

          if (msg.tool_result) {
            const toolResultEv = this.publishIntegrated(
              sessionId,
              'tool_result',
              {
                toolCallId: msg.tool_result.id,
                toolName: msg.tool_result.name ?? 'claude_tool',
                success: !msg.tool_result.is_error,
                output: !msg.tool_result.is_error ? msg.tool_result.content : undefined,
                error: msg.tool_result.is_error ? msg.tool_result.content : undefined,
              },
              {
                scope: 'explicit_file_import',
                originalId: msg.tool_result.id,
              },
            );
            sessionEvents.push(toolResultEv);
          }
        }
      }

      // Session completed
      const endEv = this.publishIntegrated(
        sessionId,
        'session_completed',
        {
          success: true,
          durationMs: 0,
          summary: `Imported from Claude session: ${conv.name}`,
        },
        {
          scope: 'explicit_file_import',
          originalId: conv.uuid,
        },
      );
      sessionEvents.push(endEv);

      importedSessions.push({
        sessionId,
        title: conv.name,
        originalId: conv.uuid,
        eventCount: sessionEvents.length,
      });

      allEvents.push(...sessionEvents);
    }

    return { sessions: importedSessions, events: allEvents };
  }
}
