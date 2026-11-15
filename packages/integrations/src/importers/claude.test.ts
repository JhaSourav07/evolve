import { describe, expect, it } from 'vitest';
import { SecurityError } from '@evolve/core';
import { ConsentManager } from '../consent/manager.js';
import { ClaudeImporter } from './claude.js';

describe('ClaudeImporter', () => {
  it('throws SecurityError if external import consent is absent', () => {
    const consent = new ConsentManager();
    const importer = new ClaudeImporter(consent);

    expect(() => importer.importConversations([])).toThrow(SecurityError);
  });

  it('imports Claude conversation exports and normalizes into Evolve events', () => {
    const consent = new ConsentManager({ allowClaudeImport: true });
    const importer = new ClaudeImporter(consent);

    const mockExport = [
      {
        uuid: 'claude-conv-abc',
        name: 'Build React Counter',
        created_at: '2026-03-01T10:00:00.000Z',
        updated_at: '2026-03-01T10:05:00.000Z',
        chat_messages: [
          {
            uuid: 'msg-1',
            sender: 'human',
            text: 'Create a simple counter hook in React',
            created_at: '2026-03-01T10:00:01.000Z',
          },
          {
            uuid: 'msg-2',
            sender: 'assistant',
            text: 'Here is the hook implementation:\n```ts\nfunction useCounter()...\n```',
            created_at: '2026-03-01T10:00:05.000Z',
            tool_use: {
              id: 'tool_call_101',
              name: 'write_file',
              input: { path: 'src/useCounter.ts' },
            },
            tool_result: {
              id: 'tool_call_101',
              name: 'write_file',
              content: 'Wrote 15 lines',
              is_error: false,
            },
          },
        ],
      },
    ];

    const result = importer.importConversations(mockExport);
    expect(result.sessions.length).toBe(1);
    expect(result.sessions[0].sessionId).toBe('sess_claude_claude-conv-abc');
    expect(result.sessions[0].title).toBe('Build React Counter');

    const eventTypes = result.events.map((e) => e.type);
    expect(eventTypes).toEqual([
      'session_started',
      'user_prompt',
      'assistant_response',
      'tool_call',
      'tool_result',
      'session_completed',
    ]);

    // Check attribution
    for (const ev of result.events) {
      expect(ev.attribution.source).toBe('claude_import');
      expect(ev.attribution.consentGranted).toBe(true);
    }

    const userPrompt = result.events.find((e) => e.type === 'user_prompt');
    expect(userPrompt?.payload.prompt).toBe('Create a simple counter hook in React');
  });
});
