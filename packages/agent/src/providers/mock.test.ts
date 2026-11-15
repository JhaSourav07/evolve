import { describe, expect, it } from 'vitest';
import { MockModelProvider } from './mock.js';

describe('MockModelProvider', () => {
  it('returns queued responses and tracks call history', async () => {
    const provider = new MockModelProvider();
    provider.enqueueResponse({
      message: { role: 'assistant', content: 'First queued reply' },
    });

    const response = await provider.generate([{ role: 'user', content: 'Hello' }]);
    expect(response.message.content).toBe('First queued reply');

    const history = provider.getCalls();
    expect(history).toHaveLength(1);
    expect(history[0]?.messages[0]?.content).toBe('Hello');

    // Subsequent call without queue yields fallback
    const fallback = await provider.generate([{ role: 'user', content: 'Second' }]);
    expect(fallback.message.content).toBe('Default mock response');
  });

  it('streams chunked responses', async () => {
    const provider = new MockModelProvider();
    provider.enqueueResponse({
      message: { role: 'assistant', content: 'Hello stream world' },
    });

    const chunks: string[] = [];
    for await (const chunk of provider.stream([{ role: 'user', content: 'Stream test' }])) {
      chunks.push(chunk.delta);
    }

    expect(chunks.join('')).toBe('Hello stream world');
  });
});
