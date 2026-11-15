import { describe, expect, it } from 'vitest';
import { SecurityError } from '@evolve/core';
import { ConsentManager } from '../consent/manager.js';
import { GeminiImporter } from './gemini.js';

describe('GeminiImporter', () => {
  it('throws SecurityError if Gemini import consent is absent', () => {
    const consent = new ConsentManager();
    const importer = new GeminiImporter(consent);

    expect(() => importer.importConversations([])).toThrow(SecurityError);
  });

  it('imports Gemini conversation exports and normalizes parts into Evolve events', () => {
    const consent = new ConsentManager({ allowGeminiImport: true });
    const importer = new GeminiImporter(consent);

    const mockExport = [
      {
        id: 'gemini-task-789',
        title: 'Fix SQLite Index Query',
        createTime: '2026-03-01T15:00:00Z',
        messages: [
          {
            role: 'user',
            parts: [{ text: 'How do I add a compound index in Drizzle ORM?' }],
          },
          {
            role: 'model',
            parts: [
              {
                text: 'You can define an index using index().on(colA, colB)',
              },
              {
                functionCall: {
                  name: 'search_code',
                  args: { query: 'sqliteTable' },
                },
              },
            ],
          },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: 'search_code',
                  response: { matches: ['schema.ts:15'] },
                },
              },
            ],
          },
        ],
      },
    ];

    const result = importer.importConversations(mockExport);
    expect(result.sessions.length).toBe(1);
    expect(result.sessions[0].sessionId).toBe('sess_gemini_gemini-task-789');

    const types = result.events.map((e) => e.type);
    expect(types).toEqual([
      'session_started',
      'user_prompt',
      'assistant_response',
      'tool_call',
      'tool_result',
      'session_completed',
    ]);

    for (const ev of result.events) {
      expect(ev.attribution.source).toBe('gemini_import');
      expect(ev.attribution.consentGranted).toBe(true);
    }

    const toolCall = result.events.find((e) => e.type === 'tool_call');
    expect(toolCall?.payload.toolName).toBe('search_code');
  });
});
