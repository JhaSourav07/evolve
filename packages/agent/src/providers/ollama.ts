import { randomUUID } from 'node:crypto';
import {
  ErrorCodes,
  ModelProviderError,
  type ModelGenerateOptions,
  type ModelMessage,
  type ModelProvider,
  type ModelResponse,
  type ModelStreamChunk,
  type ModelToolDefinition,
} from '@evolve/core';
import { parseOllamaToolCalls } from './parser.js';
import type { OllamaHealthResult, OllamaModelInfo, OllamaProviderConfig } from './types.js';

interface RawOllamaResponse {
  model?: string;
  message?: {
    role?: string;
    content?: string;
    thinking?: string;
    tool_calls?: Array<{
      id?: string;
      function?: {
        name?: string;
        arguments?: Record<string, unknown> | string;
      };
    }>;
  };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
}

export class OllamaProvider implements ModelProvider {
  public readonly name = 'ollama';
  private readonly baseUrl: string;
  private currentModel: string;
  private readonly defaultTemperature: number;
  private readonly timeoutMs: number;

  constructor(config: OllamaProviderConfig = {}) {
    this.baseUrl = (config.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
    this.currentModel = config.model || 'qwen3.5:9b';
    this.defaultTemperature = config.defaultTemperature ?? 0.2;
    this.timeoutMs = config.timeoutMs ?? 60_000;
  }

  public getModel(): string {
    return this.currentModel;
  }

  public setModel(model: string): void {
    if (!model || model.trim().length === 0) {
      throw new ModelProviderError('Model name cannot be empty', {
        details: { code: ErrorCodes.CONFIG_INVALID },
      });
    }
    this.currentModel = model.trim();
  }

  /**
   * Checks connectivity to the local Ollama server and returns health details.
   */
  public async checkHealth(): Promise<OllamaHealthResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3_000);

      const res = await fetch(`${this.baseUrl}/api/version`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          isHealthy: false,
          modelsAvailable: 0,
          error: `Ollama returned HTTP ${res.status}`,
        };
      }

      const versionData = (await res.json()) as { version?: string };
      const models = await this.listModels();

      return {
        isHealthy: true,
        version: versionData.version,
        modelsAvailable: models.length,
        activeModel: this.currentModel,
      };
    } catch (err) {
      return {
        isHealthy: false,
        modelsAvailable: 0,
        error: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  }

  /**
   * Discovers and returns all locally installed models in Ollama.
   */
  public async listModels(): Promise<OllamaModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) {
        throw new Error(`Failed to list models (HTTP ${res.status})`);
      }

      const data = (await res.json()) as {
        models?: Array<{
          name: string;
          size: number;
          details?: {
            parameter_size?: string;
            family?: string;
            format?: string;
            quantization_level?: string;
          };
          modified_at?: string;
        }>;
      };

      if (!data.models || !Array.isArray(data.models)) {
        return [];
      }

      return data.models.map((m) => ({
        name: m.name,
        size: m.size,
        parameterSize: m.details?.parameter_size,
        family: m.details?.family,
        format: m.details?.format,
        quantizationLevel: m.details?.quantization_level,
        modifiedAt: m.modified_at,
      }));
    } catch (err) {
      throw new ModelProviderError('Failed to discover Ollama models', {
        cause: err,
        details: { baseUrl: this.baseUrl },
      });
    }
  }

  /**
   * Automatically selects the best available coding model from local Ollama tags.
   */
  public async autoSelectModel(): Promise<string> {
    const models = await this.listModels();
    if (models.length === 0) {
      return this.currentModel;
    }

    const preferred =
      models.find((m) => m.name.toLowerCase().includes('coder')) ||
      models.find((m) => m.name.toLowerCase().includes('qwen')) ||
      models[0];

    if (preferred) {
      this.currentModel = preferred.name;
    }

    return this.currentModel;
  }

  /**
   * Generates a complete response (non-streaming).
   */
  public async generate(
    messages: readonly ModelMessage[],
    options?: ModelGenerateOptions,
  ): Promise<ModelResponse> {
    const body = this.buildRequestBody(messages, options, false);
    const raw = await this.executeChatRequest<RawOllamaResponse>(body, options?.signal);

    const content = raw.message?.content || '';
    const rawToolCalls = raw.message?.tool_calls;
    const toolCalls = parseOllamaToolCalls(rawToolCalls, content);

    const finishReason =
      raw.done_reason === 'stop' ? (toolCalls.length > 0 ? 'tool_calls' : 'stop') : 'stop';

    return {
      id: `resp_${randomUUID().slice(0, 8)}`,
      finishReason,
      message: {
        role: 'assistant',
        content,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      },
      usage: {
        promptTokens: raw.prompt_eval_count || 0,
        completionTokens: raw.eval_count || 0,
        totalTokens: (raw.prompt_eval_count || 0) + (raw.eval_count || 0),
      },
    };
  }

  /**
   * Generates a streaming response yielding real-time chunks.
   */
  public async *stream(
    messages: readonly ModelMessage[],
    options?: ModelGenerateOptions,
  ): AsyncIterable<ModelStreamChunk> {
    const body = this.buildRequestBody(messages, options, true);
    const response = await this.executeStreamingRequest(body, options?.signal);

    if (!response.body) {
      throw new ModelProviderError('Ollama streaming response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const chunk = JSON.parse(trimmed) as RawOllamaResponse;
            const delta = chunk.message?.content || '';
            const isDone = Boolean(chunk.done);

            const toolCalls = parseOllamaToolCalls(chunk.message?.tool_calls, delta);

            yield {
              delta,
              ...(toolCalls[0] ? { toolCallDelta: toolCalls[0] } : {}),
              isDone,
              ...(chunk.done_reason ? { finishReason: 'stop' as const } : {}),
            };
          } catch {
            // Ignore incomplete JSON line fragments
          }
        }
      }

      // Process any trailing line left in the buffer
      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer.trim()) as RawOllamaResponse;
          const delta = chunk.message?.content || '';
          const isDone = Boolean(chunk.done);
          const toolCalls = parseOllamaToolCalls(chunk.message?.tool_calls, delta);

          yield {
            delta,
            ...(toolCalls[0] ? { toolCallDelta: toolCalls[0] } : {}),
            isDone,
            ...(chunk.done_reason ? { finishReason: 'stop' as const } : {}),
          };
        } catch {
          // Ignore parse errors on trailing fragment
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildRequestBody(
    messages: readonly ModelMessage[],
    options?: ModelGenerateOptions,
    stream = false,
  ): Record<string, unknown> {
    const ollamaMessages = messages.map((m) => {
      if (m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: m.role,
          content: m.content || '',
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          })),
        };
      }

      return {
        role: m.role,
        content: m.content,
      };
    });

    const payload: Record<string, unknown> = {
      model: this.currentModel,
      messages: ollamaMessages,
      stream,
      options: {
        temperature: options?.temperature ?? this.defaultTemperature,
        ...(options?.maxTokens ? { num_predict: options.maxTokens } : {}),
      },
    };

    if (options?.tools && options.tools.length > 0) {
      payload['tools'] = this.formatToolsForOllama(options.tools);
    }

    return payload;
  }

  private formatToolsForOllama(
    tools: readonly ModelToolDefinition[],
  ): Array<Record<string, unknown>> {
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  private async executeChatRequest<T>(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });

      if (!res.ok) {
        const errorText = await res.text();
        if (res.status === 404) {
          throw new ModelProviderError(
            `Model "${this.currentModel}" not found on Ollama server. Pull it using: ollama pull ${this.currentModel}`,
            { details: { status: res.status, errorText } },
          );
        }
        throw new ModelProviderError(
          `Ollama request failed with HTTP ${res.status}: ${errorText}`,
          {
            details: { status: res.status, errorText },
          },
        );
      }

      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof ModelProviderError) throw err;
      throw new ModelProviderError(
        `Failed to communicate with Ollama at ${this.baseUrl}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        { cause: err },
      );
    }
  }

  private async executeStreamingRequest(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Response> {
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new ModelProviderError(
          `Ollama stream request failed (HTTP ${res.status}): ${errorText}`,
        );
      }

      return res;
    } catch (err) {
      if (err instanceof ModelProviderError) throw err;
      throw new ModelProviderError(
        `Failed to start Ollama stream at ${this.baseUrl}: ${err instanceof Error ? err.message : 'Unknown error'}`,
        { cause: err },
      );
    }
  }
}
