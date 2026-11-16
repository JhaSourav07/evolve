import { randomUUID } from 'node:crypto';
import {
  createSessionId,
  InMemoryEventBus,
  noopLogger,
  validateEventPayload,
  type CoreEventType,
  type EventEnvelope,
  type EventInputPayloadMap,
  type EventListener,
  type Logger,
  type ModelProvider,
  type SessionId,
  type ToolCallId,
  type Unsubscribe,
} from '@evolve/core';
import { ToolRegistry } from '../tools/registry.js';
import { ContextManager } from './context.js';
import { ConversationManager } from './conversation.js';
import type {
  AgentEventSink,
  AgentRuntimeConfig,
  AgentRuntimeOptions,
  AgentRunOptions,
  AgentRunResult,
} from './types.js';

/**
 * Autonomous Agent Runtime.
 * Manages the iterative think-act-observe agent loop, context management,
 * tool invocation, error recovery, cancellation, and event emission.
 */
export class AgentRuntime {
  private readonly provider: ModelProvider;
  private readonly config: AgentRuntimeConfig;
  private readonly tools: ToolRegistry;
  private readonly eventSink?: AgentEventSink | undefined;
  private readonly logger: Logger;
  private readonly internalBus: InMemoryEventBus;
  private readonly conversation: ConversationManager;
  private readonly contextManager: ContextManager;

  constructor(options: AgentRuntimeOptions) {
    this.provider = options.provider;
    this.config = options.config;
    this.tools = options.tools ?? new ToolRegistry();
    this.eventSink = options.eventSink;
    this.logger = options.logger ?? noopLogger;
    this.internalBus = new InMemoryEventBus();
    this.conversation = new ConversationManager();
    this.contextManager = new ContextManager({
      workspaceRoot: options.config.workspaceRoot,
      systemPrompt: options.config.systemPrompt,
      maxTokens: options.config.maxContextTokens,
    });
  }

  public getConversation(): ConversationManager {
    return this.conversation;
  }

  public getContextManager(): ContextManager {
    return this.contextManager;
  }

  public getTools(): ToolRegistry {
    return this.tools;
  }

  public getEventBus(): InMemoryEventBus {
    return this.internalBus;
  }

  public on<K extends CoreEventType>(
    event: K,
    listener: EventListener<EventEnvelope<K>>,
  ): Unsubscribe {
    return this.internalBus.on(event, listener);
  }

  public onAny(listener: EventListener<EventEnvelope>): Unsubscribe {
    return this.internalBus.onAny(listener);
  }

  private emitEvent<T extends CoreEventType>(
    sessionId: SessionId,
    type: T,
    payload: EventInputPayloadMap[T],
  ): void {
    if (
      this.eventSink &&
      'publish' in this.eventSink &&
      typeof this.eventSink.publish === 'function'
    ) {
      const envelope = this.eventSink.publish(sessionId, type, payload);
      if (envelope) {
        this.internalBus.emit(type, envelope);
      }
      return;
    }

    const validatedPayload = validateEventPayload(type, payload);
    const envelope: EventEnvelope<T> = {
      id: `evt_${randomUUID()}`,
      sessionId,
      type,
      timestamp: Date.now(),
      payload: validatedPayload,
    };

    if (this.eventSink && 'emit' in this.eventSink && typeof this.eventSink.emit === 'function') {
      this.eventSink.emit(type, envelope);
    }

    this.internalBus.emit(type, envelope);
  }

  /**
   * Runs an agent task from start to completion through the agent loop.
   */
  public async run(prompt: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    const startTime = Date.now();
    const sessionId = options?.sessionId ?? createSessionId();
    const signal = options?.signal;
    const maxSteps = this.config.maxSteps ?? 20;
    let step = 0;

    this.logger.info(`Starting agent session ${sessionId}`, { sessionId, prompt });

    // 1. Inject retrieved memories if provided
    if (options?.memories && options.memories.length > 0) {
      this.contextManager.injectMemories(options.memories);
    }

    // 2. Emit session_started if first turn in conversation
    const providerAny = this.provider as unknown as { getModel?: () => string };
    const activeModelName =
      typeof providerAny.getModel === 'function' ? providerAny.getModel() : this.provider.name;

    if (this.conversation.count() === 0) {
      this.emitEvent(sessionId, 'session_started', {
        goal: prompt,
        workspaceRoot: this.config.workspaceRoot,
        modelConfig: {
          model: activeModelName,
          provider: this.provider.name,
          ...(this.config.temperature !== undefined
            ? { temperature: this.config.temperature }
            : {}),
        },
      });
    }

    // 3. Emit user_prompt & append to conversation
    this.emitEvent(sessionId, 'user_prompt', {
      prompt,
      context: {
        workspaceRoot: this.config.workspaceRoot,
      },
    });
    this.conversation.addUserMessage(prompt);

    // 4. Agent Execution Loop
    while (step < maxSteps) {
      step++;

      // Check cancellation before invoking model
      if (signal?.aborted) {
        const durationMs = Date.now() - startTime;
        const error = 'Agent execution aborted by signal';
        this.emitEvent(sessionId, 'session_completed', {
          success: false,
          durationMs,
          error,
        });
        return {
          sessionId,
          success: false,
          finalResponse: this.conversation.getLastAssistantMessage()?.content ?? '',
          stepsExecuted: step,
          durationMs,
          error,
        };
      }

      // Build model messages & tools
      const messages = this.contextManager.buildContextMessages(this.conversation.getMessages());
      const tools = this.contextManager.constructModelTools(this.tools);

      this.logger.debug(`Step ${step}: invoking model ${this.provider.name}`, {
        step,
        messageCount: messages.length,
      });

      // Invoke model with error recovery
      let response;
      try {
        response = await this.provider.generate(messages, {
          ...(this.config.temperature !== undefined
            ? { temperature: this.config.temperature }
            : {}),
          ...(tools ? { tools } : {}),
          ...(signal ? { signal } : {}),
        });
      } catch (modelErr) {
        const durationMs = Date.now() - startTime;
        const error = `Model invocation failed: ${modelErr instanceof Error ? modelErr.message : String(modelErr)}`;
        this.logger.error(error, modelErr);
        this.emitEvent(sessionId, 'session_completed', {
          success: false,
          durationMs,
          error,
        });
        return {
          sessionId,
          success: false,
          finalResponse: this.conversation.getLastAssistantMessage()?.content ?? '',
          stepsExecuted: step,
          durationMs,
          error,
        };
      }

      const assistantMessage = response.message;
      this.conversation.addAssistantMessage(
        assistantMessage.content,
        assistantMessage.toolCalls,
        assistantMessage.thinking,
      );

      // Emit assistant_response
      this.emitEvent(sessionId, 'assistant_response', {
        content: assistantMessage.content,
        model: activeModelName,
        ...(assistantMessage.thinking ? { thinking: assistantMessage.thinking } : {}),
        finishReason: response.finishReason,
      });

      // If no tool calls were requested, the agent has determined the task is complete!
      const toolCalls = assistantMessage.toolCalls;
      if (!toolCalls || toolCalls.length === 0) {
        const durationMs = Date.now() - startTime;
        this.logger.info(`Session ${sessionId} completed successfully at step ${step}`, {
          durationMs,
        });
        this.emitEvent(sessionId, 'session_completed', {
          success: true,
          durationMs,
          summary: assistantMessage.content,
        });
        return {
          sessionId,
          success: true,
          finalResponse: assistantMessage.content,
          ...(assistantMessage.thinking ? { thinking: assistantMessage.thinking } : {}),
          stepsExecuted: step,
          durationMs,
        };
      }

      // Execute requested tool calls sequentially
      for (const tc of toolCalls) {
        if (signal?.aborted) {
          break;
        }

        this.logger.debug(`Step ${step}: executing tool '${tc.name}' (${tc.id})`, {
          toolName: tc.name,
          args: tc.arguments,
        });

        // Emit tool_call event
        this.emitEvent(sessionId, 'tool_call', {
          toolCallId: tc.id,
          toolName: tc.name,
          arguments: tc.arguments,
        });

        const tool = this.tools.get(tc.name);
        let output: string;
        let isSuccess: boolean;

        if (!tool) {
          output = `Error: Tool '${tc.name}' is not recognized. Available tools: ${this.tools
            .list()
            .map((t) => t.definition.name)
            .join(', ')}`;
          isSuccess = false;
        } else {
          try {
            const parsedArgs = tool.definition.parameters.safeParse(tc.arguments);
            if (!parsedArgs.success) {
              output = `Invalid arguments for tool '${tc.name}': ${parsedArgs.error.message}`;
              isSuccess = false;
            } else {
              const execResult = await tool.execute(parsedArgs.data, {
                sessionId,
                workspaceRoot: this.config.workspaceRoot,
                ...(signal ? { signal } : {}),
                logger: this.logger,
                ...(this.config.requestApproval
                  ? { requestApproval: this.config.requestApproval }
                  : {}),
                ...(this.config.projectId ? { projectId: this.config.projectId } : {}),
                ...(this.config.database ? { database: this.config.database } : {}),
              });
              output = execResult.output;
              isSuccess = execResult.success;
            }
          } catch (execErr) {
            // Tool threw an unhandled error: recover gracefully
            output = `Tool execution exception: ${execErr instanceof Error ? execErr.message : String(execErr)}`;
            isSuccess = false;
          }
        }

        // Emit tool_result event
        this.emitEvent(sessionId, 'tool_result', {
          toolCallId: tc.id,
          toolName: tc.name,
          output,
          success: isSuccess,
          ...(!isSuccess ? { error: output } : {}),
        });

        // Add tool result to conversation history
        this.conversation.addToolResult(tc.id as ToolCallId, output, tc.name);
      }
    }

    // Step limit reached without completion
    const durationMs = Date.now() - startTime;
    const limitError = `Maximum iteration limit reached (${maxSteps} steps)`;
    this.logger.warn(limitError, { sessionId, stepsExecuted: step });

    this.emitEvent(sessionId, 'session_completed', {
      success: false,
      durationMs,
      error: limitError,
    });

    return {
      sessionId,
      success: false,
      finalResponse: this.conversation.getLastAssistantMessage()?.content ?? '',
      stepsExecuted: step,
      durationMs,
      error: limitError,
    };
  }
}
