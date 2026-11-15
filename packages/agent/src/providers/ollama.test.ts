import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaProvider } from './ollama.js';

describe('OllamaProvider Unit Tests (Mocked Network)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('checks server health and parses version', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/api/version')) {
        return new Response(JSON.stringify({ version: '0.5.4' }), { status: 200 });
      }
      if (urlStr.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'qwen3.5:9b', size: 6550825550 }] }),
          {
            status: 200,
          },
        );
      }
      return new Response('Not found', { status: 404 });
    });

    const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434' });
    const health = await provider.checkHealth();

    expect(health.isHealthy).toBe(true);
    expect(health.version).toBe('0.5.4');
    expect(health.modelsAvailable).toBe(1);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('reports unhealthy when Ollama connection fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const provider = new OllamaProvider({ baseUrl: 'http://localhost:99999' });
    const health = await provider.checkHealth();

    expect(health.isHealthy).toBe(false);
    expect(health.error).toContain('ECONNREFUSED');
  });

  it('discovers models and auto-selects coding model', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            models: [
              { name: 'llama3:8b', size: 4000000000 },
              { name: 'qwen2.5-coder:7b', size: 4500000000 },
            ],
          }),
          { status: 200 },
        ),
    );

    const provider = new OllamaProvider();
    const models = await provider.listModels();
    expect(models).toHaveLength(2);

    const selected = await provider.autoSelectModel();
    expect(selected).toBe('qwen2.5-coder:7b');
  });

  it('generates non-streaming responses and parses usage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'qwen3.5:9b',
          message: {
            role: 'assistant',
            content: 'console.log("hello");',
          },
          done_reason: 'stop',
          prompt_eval_count: 12,
          eval_count: 8,
        }),
        { status: 200 },
      ),
    );

    const provider = new OllamaProvider({ model: 'qwen3.5:9b' });
    const response = await provider.generate([{ role: 'user', content: 'Say hello' }]);

    expect(response.message.content).toBe('console.log("hello");');
    expect(response.finishReason).toBe('stop');
    expect(response.usage?.promptTokens).toBe(12);
    expect(response.usage?.completionTokens).toBe(8);
    expect(response.usage?.totalTokens).toBe(20);
  });

  it('throws helpful error when model is not found (HTTP 404)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('model not found', { status: 404 }),
    );

    const provider = new OllamaProvider({ model: 'non-existent-model' });

    await expect(provider.generate([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
      /Pull it using: ollama pull non-existent-model/,
    );
  });

  it('streams NDJSON chunks from Ollama endpoint', async () => {
    const ndjson = [
      JSON.stringify({ message: { content: 'Thinking' }, done: false }),
      JSON.stringify({ message: { content: '...' }, done: false }),
      JSON.stringify({ message: { content: ' Done' }, done: true, done_reason: 'stop' }),
    ].join('\n');

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ndjson));
        controller.close();
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(stream, { status: 200 }));

    const provider = new OllamaProvider();
    const chunks: string[] = [];

    for await (const chunk of provider.stream([{ role: 'user', content: 'Hi' }])) {
      chunks.push(chunk.delta);
    }

    expect(chunks.join('')).toBe('Thinking... Done');
  });
});

describe('Live Local Ollama Integration', () => {
  it('connects to live local Ollama instance if running', async () => {
    const provider = new OllamaProvider();
    const health = await provider.checkHealth();

    if (!health.isHealthy) {
      // Skip if Ollama is not running in CI or offline environment
      return;
    }

    expect(health.isHealthy).toBe(true);
    expect(health.modelsAvailable).toBeGreaterThan(0);

    const selectedModel = await provider.autoSelectModel();
    expect(selectedModel).toBeDefined();

    // Perform a fast test inference
    const response = await provider.generate([
      { role: 'user', content: 'Reply with the single word: PONG' },
    ]);

    expect(response.message.content).toBeDefined();
    expect(response.message.content.length).toBeGreaterThan(0);
  }, 30_000); // 30s timeout for live LLM execution
});
