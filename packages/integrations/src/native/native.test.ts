import { describe, expect, it } from 'vitest';
import { ConsentManager } from '../consent/manager.js';
import { NativeEventAdapter } from './adapter.js';

describe('NativeEventAdapter', () => {
  it('records native events and attaches native attribution', () => {
    const consent = new ConsentManager();
    const adapter = new NativeEventAdapter(consent);

    const events: unknown[] = [];
    adapter.onIntegratedEvent((e) => events.push(e));

    const promptEv = adapter.recordUserPrompt('sess_test', 'Write a binary search');
    expect(promptEv.type).toBe('user_prompt');
    expect(promptEv.payload.prompt).toBe('Write a binary search');
    expect(promptEv.attribution.source).toBe('evolve_native');
    expect(promptEv.attribution.consentGranted).toBe(true);

    const respEv = adapter.recordAssistantResponse('sess_test', 'def binary_search()...');
    expect(respEv.type).toBe('assistant_response');

    const toolCallEv = adapter.recordToolCall('sess_test', 'tc_1', 'read_file', {
      path: 'index.ts',
    });
    expect(toolCallEv.type).toBe('tool_call');

    const toolResultEv = adapter.recordToolResult(
      'sess_test',
      'tc_1',
      'read_file',
      true,
      'file content',
    );
    expect(toolResultEv.type).toBe('tool_result');

    expect(events.length).toBe(4);
  });
});
