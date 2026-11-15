import type { EvolveError } from '../errors/index.js';
import type { SessionId, ToolCallId } from '../ids/index.js';
import type { ToolExecutionResult } from '../tools/index.js';

export interface AgentEventMap {
  'session:started': { sessionId: SessionId; goal: string; timestamp: number };
  'session:completed': {
    sessionId: SessionId;
    success: boolean;
    resultSummary?: string;
    timestamp: number;
  };
  'session:failed': { sessionId: SessionId; error: EvolveError; timestamp: number };

  'model:request': { sessionId: SessionId; messageCount: number; timestamp: number };
  'model:response': {
    sessionId: SessionId;
    finishReason: string;
    totalTokens?: number;
    timestamp: number;
  };
  'model:stream': { sessionId: SessionId; delta: string; timestamp: number };

  'tool:executing': {
    sessionId: SessionId;
    toolCallId: ToolCallId;
    toolName: string;
    params: unknown;
    timestamp: number;
  };
  'tool:completed': {
    sessionId: SessionId;
    toolCallId: ToolCallId;
    toolName: string;
    result: ToolExecutionResult;
    timestamp: number;
  };
  'tool:failed': {
    sessionId: SessionId;
    toolCallId: ToolCallId;
    toolName: string;
    error: string;
    timestamp: number;
  };

  'reflection:created': {
    sessionId: SessionId;
    critique: string;
    suggestion: string;
    timestamp: number;
  };
}

export type EventType = keyof AgentEventMap;

export type EventListener<T> = (payload: T) => void;
export type Unsubscribe = () => void;

export interface EventBus {
  emit<K extends keyof AgentEventMap>(event: K, payload: AgentEventMap[K]): void;
  on<K extends keyof AgentEventMap>(
    event: K,
    listener: EventListener<AgentEventMap[K]>,
  ): Unsubscribe;
  once<K extends keyof AgentEventMap>(
    event: K,
    listener: EventListener<AgentEventMap[K]>,
  ): Unsubscribe;
  off<K extends keyof AgentEventMap>(event: K, listener: EventListener<AgentEventMap[K]>): void;
  removeAllListeners(event?: keyof AgentEventMap): void;
}
