import type {
  CoreEventType,
  EventEnvelope,
  EventInputPayloadMap,
  Logger,
  ModelProvider,
  SessionId,
  ToolApprovalHandler,
} from '@evolve/core';
import type { ToolRegistry } from '../tools/registry.js';

export interface AgentRuntimeConfig {
  workspaceRoot: string;
  maxSteps?: number | undefined;
  temperature?: number | undefined;
  systemPrompt?: string | undefined;
  maxContextTokens?: number | undefined;
  requestApproval?: ToolApprovalHandler | undefined;
}

export interface EventPublisherLike {
  publish<T extends CoreEventType>(
    sessionId: SessionId | string,
    type: T,
    payload: EventInputPayloadMap[T],
  ): EventEnvelope<T> | void;
}

export interface EventBusLike {
  emit<K extends CoreEventType>(event: K, envelope: EventEnvelope<K>): void;
}

export type AgentEventSink = EventPublisherLike | EventBusLike;

export interface AgentRuntimeOptions {
  provider: ModelProvider;
  config: AgentRuntimeConfig;
  tools?: ToolRegistry | undefined;
  eventSink?: AgentEventSink | undefined;
  logger?: Logger | undefined;
}

export interface AgentRunOptions {
  signal?: AbortSignal | undefined;
  sessionId?: SessionId | undefined;
}

export interface AgentRunResult {
  sessionId: SessionId;
  success: boolean;
  finalResponse: string;
  stepsExecuted: number;
  durationMs: number;
  error?: string | undefined;
}
