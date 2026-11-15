import { randomUUID } from 'node:crypto';
import type {
  ModelGenerateOptions,
  ModelMessage,
  ModelProvider,
  ModelResponse,
  ModelStreamChunk,
} from '@evolve/core';

export class MockModelProvider implements ModelProvider {
  public readonly name = 'mock';
  private readonly queue: ModelResponse[] = [];
  private readonly callHistory: {
    messages: readonly ModelMessage[];
    options?: ModelGenerateOptions | undefined;
  }[] = [];

  public enqueueResponse(response: Partial<ModelResponse>): void {
    this.queue.push({
      id: response.id ?? `resp_${randomUUID().slice(0, 8)}`,
      finishReason: response.finishReason ?? 'stop',
      message: response.message ?? {
        role: 'assistant',
        content: 'Mock response',
      },
      usage: response.usage ?? {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    });
  }

  public getCalls(): readonly {
    messages: readonly ModelMessage[];
    options?: ModelGenerateOptions | undefined;
  }[] {
    return this.callHistory;
  }

  public clear(): void {
    this.queue.length = 0;
    this.callHistory.length = 0;
  }

  public async generate(
    messages: readonly ModelMessage[],
    options?: ModelGenerateOptions,
  ): Promise<ModelResponse> {
    this.callHistory.push({ messages, ...(options ? { options } : {}) });

    const next = this.queue.shift();
    if (next) {
      return next;
    }

    // Default fallback response
    return {
      id: `resp_${randomUUID().slice(0, 8)}`,
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content: 'Default mock response',
      },
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
    };
  }

  public async *stream(
    messages: readonly ModelMessage[],
    options?: ModelGenerateOptions,
  ): AsyncIterable<ModelStreamChunk> {
    this.callHistory.push({ messages, ...(options ? { options } : {}) });

    const response = await this.generate(messages, options);
    const words = response.message.content.split(' ');

    for (let i = 0; i < words.length; i++) {
      const isLast = i === words.length - 1;
      yield {
        delta: (words[i] ?? '') + (isLast ? '' : ' '),
        isDone: isLast,
        ...(isLast && response.finishReason ? { finishReason: response.finishReason } : {}),
      };
    }
  }
}
