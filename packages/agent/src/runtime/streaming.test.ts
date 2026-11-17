import { describe, expect, it, vi } from 'vitest';
import { AgentRuntime } from './agent.js';
import { MockModelProvider } from '../providers/mock.js';

describe('AgentRuntime Streaming Support', () => {
  it('streams response chunks via onChunk callback when supported by provider', async () => {
    const provider = new MockModelProvider();
    provider.enqueueResponse({
      message: { role: 'assistant', content: 'Streaming test complete response' },
      finishReason: 'stop',
    });

    const runtime = new AgentRuntime({
      provider,
      config: {
        workspaceRoot: '/tmp',
        maxSteps: 2,
      },
    });

    const receivedChunks: string[] = [];
    const onChunk = vi.fn(({ delta }: { delta: string }) => {
      receivedChunks.push(delta);
    });

    const result = await runtime.run('Tell me a story', {
      onChunk,
    });

    expect(result.success).toBe(true);
    expect(result.finalResponse).toBe('Streaming test complete response');
    expect(onChunk).toHaveBeenCalled();
    expect(receivedChunks.join('')).toBe('Streaming test complete response');
  });
});
