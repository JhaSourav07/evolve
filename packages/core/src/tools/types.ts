import type { z } from 'zod';
import type { SessionId } from '../ids/index.js';
import type { Logger } from '../logger/index.js';

export interface ToolDefinition<TParams = unknown> {
  name: string;
  description: string;
  parameters: z.ZodType<TParams>;
}

export interface ToolExecutionContext {
  sessionId: SessionId;
  workspaceRoot: string;
  signal?: AbortSignal;
  logger: Logger;
}

export interface ToolExecutionResult<TData = unknown> {
  success: boolean;
  output: string;
  data?: TData;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Interface that any executable Agent Tool must implement.
 */
export interface AgentTool<TParams = unknown, TData = unknown> {
  readonly definition: ToolDefinition<TParams>;
  execute(params: TParams, context: ToolExecutionContext): Promise<ToolExecutionResult<TData>>;
}
