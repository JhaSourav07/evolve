import type { ToolCallId } from '../ids/index.js';

export type ModelRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: ToolCallId;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ModelMessage {
  role: ModelRole;
  content: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: ToolCallId;
  thinking?: string;
}

export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';

export interface ModelResponse {
  id: string;
  message: ModelMessage;
  usage?: ModelUsage;
  finishReason: FinishReason;
}

export interface ModelStreamChunk {
  delta: string;
  toolCallDelta?: Partial<ToolCall>;
  isDone: boolean;
  finishReason?: FinishReason;
}

export interface ModelGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: readonly ModelToolDefinition[];
  signal?: AbortSignal;
}

export interface ModelToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

/**
 * Interface that any LLM provider (Ollama, mock, custom) must implement.
 */
export interface ModelProvider {
  readonly name: string;
  generate(
    messages: readonly ModelMessage[],
    options?: ModelGenerateOptions,
  ): Promise<ModelResponse>;
  stream(
    messages: readonly ModelMessage[],
    options?: ModelGenerateOptions,
  ): AsyncIterable<ModelStreamChunk>;
}
