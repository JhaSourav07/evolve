import { z } from 'zod';
import type { SessionId } from '@evolve/core';
import { BaseIntegrationAdapter } from '../common/base.js';
import type { IntegratedEventEnvelope, IntegrationPublisher } from '../common/types.js';
import type { ConsentManager } from '../consent/manager.js';
import type { ImportedSession } from './claude.js';

const GeminiPartSchema = z.object({
  text: z.string().optional(),
  functionCall: z
    .object({
      name: z.string(),
      args: z.record(z.string(), z.unknown()).default({}),
    })
    .optional(),
  functionResponse: z
    .object({
      name: z.string().optional(),
      response: z.record(z.string(), z.unknown()).default({}),
    })
    .optional(),
});

const GeminiMessageSchema = z.object({
  role: z.enum(['user', 'model', 'system']),
  parts: z.array(GeminiPartSchema).default([]),
  timestamp: z.string().optional(),
});

const GeminiConversationSchema = z.object({
  id: z.string().min(1),
  title: z.string().default('Gemini Conversation'),
  createTime: z.string().optional(),
  updateTime: z.string().optional(),
  messages: z.array(GeminiMessageSchema).default([]),
});

const GeminiExportSchema = z.union([z.array(GeminiConversationSchema), GeminiConversationSchema]);

export class GeminiImporter extends BaseIntegrationAdapter {
  constructor(consentManager: ConsentManager, publisher?: IntegrationPublisher) {
    super('gemini_import', consentManager, publisher);
  }

  public importConversations(
    rawInput: string | unknown,
    options?: { workspaceRoot?: string },
  ): { sessions: ImportedSession[]; events: IntegratedEventEnvelope[] } {
    // 1. Verify consent
    this.consentManager.assertConsent('gemini_import', 'explicit_file_import');

    const parsedRaw = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    const validation = GeminiExportSchema.safeParse(parsedRaw);
    if (!validation.success) {
      throw new Error(`Invalid Gemini export format: ${validation.error.message}`);
    }

    const conversations = Array.isArray(validation.data) ? validation.data : [validation.data];

    const importedSessions: ImportedSession[] = [];
    const allEvents: IntegratedEventEnvelope[] = [];
    const workspaceRoot = options?.workspaceRoot ?? process.cwd();

    for (const conv of conversations) {
      const sessionId = `sess_gemini_${conv.id}` as SessionId;
      const sessionEvents: IntegratedEventEnvelope[] = [];

      // Session start
      const startEv = this.publishIntegrated(
        sessionId,
        'session_started',
        {
          goal: conv.title,
          workspaceRoot,
        },
        {
          scope: 'explicit_file_import',
          originalId: conv.id,
          customMetadata: {
            sourceSystem: 'gemini',
            createTime: conv.createTime,
          },
        },
      );
      sessionEvents.push(startEv);

      let toolCallCounter = 0;
      let lastToolCallId = '';

      for (const msg of conv.messages) {
        if (msg.role === 'user') {
          // Process text parts
          const textParts = msg.parts
            .filter((p) => p.text && p.text.trim())
            .map((p) => p.text!.trim())
            .join('\n');

          if (textParts) {
            const promptEv = this.publishIntegrated(
              sessionId,
              'user_prompt',
              { prompt: textParts },
              {
                scope: 'explicit_file_import',
              },
            );
            sessionEvents.push(promptEv);
          }

          // Process function responses (tool results)
          for (const part of msg.parts) {
            if (part.functionResponse) {
              const respName = part.functionResponse.name ?? 'gemini_tool';
              const rawResp = part.functionResponse.response;
              const outputStr = typeof rawResp === 'string' ? rawResp : JSON.stringify(rawResp);

              const toolResultEv = this.publishIntegrated(
                sessionId,
                'tool_result',
                {
                  toolCallId: lastToolCallId || `tc_gemini_${++toolCallCounter}`,
                  toolName: respName,
                  success: true,
                  output: outputStr,
                },
                {
                  scope: 'explicit_file_import',
                },
              );
              sessionEvents.push(toolResultEv);
            }
          }
        } else if (msg.role === 'model') {
          // Process text responses
          const textParts = msg.parts
            .filter((p) => p.text && p.text.trim())
            .map((p) => p.text!.trim())
            .join('\n');

          if (textParts) {
            const respEv = this.publishIntegrated(
              sessionId,
              'assistant_response',
              {
                content: textParts,
                model: 'gemini',
              },
              {
                scope: 'explicit_file_import',
              },
            );
            sessionEvents.push(respEv);
          }

          // Process function calls (tool calls)
          for (const part of msg.parts) {
            if (part.functionCall) {
              const toolCallId = `tc_gemini_${++toolCallCounter}`;
              lastToolCallId = toolCallId;

              const toolCallEv = this.publishIntegrated(
                sessionId,
                'tool_call',
                {
                  toolCallId,
                  toolName: part.functionCall.name,
                  arguments: part.functionCall.args,
                },
                {
                  scope: 'explicit_file_import',
                  originalId: toolCallId,
                },
              );
              sessionEvents.push(toolCallEv);
            }
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
          summary: `Imported from Gemini conversation: ${conv.title}`,
        },
        {
          scope: 'explicit_file_import',
          originalId: conv.id,
        },
      );
      sessionEvents.push(endEv);

      importedSessions.push({
        sessionId,
        title: conv.title,
        originalId: conv.id,
        eventCount: sessionEvents.length,
      });

      allEvents.push(...sessionEvents);
    }

    return { sessions: importedSessions, events: allEvents };
  }
}
