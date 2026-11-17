import path from 'node:path';
import {
  createSessionId,
  createToolCallId,
  InMemoryEventBus,
  noopLogger,
  type CoreEventType,
  type EventEnvelope,
  type EventInputPayloadMap,
  type Logger,
  type ModelProvider,
  type Plan,
  type PlanExecutionOptions,
  type PlanExecutionResult,
  type PlanTask,
  type SessionId,
  type TaskExecutionResult,
  type TaskStatus,
  type VerificationResult,
} from '@evolve/core';
import type { EvolveDatabaseInstance } from '@evolve/db';
import { FeedbackService, MemoryService, PlanRepository } from '@evolve/db';
import { DirectedAcyclicGraph } from '@evolve/planner';
import { DebuggingEngine } from '../debugging/engine.js';
import { EvaluationEngine } from '../evaluation/index.js';
import { MemoryConsolidator, MemoryExtractor, MemoryRetriever } from '../memory/index.js';
import { AgentRuntime } from '../runtime/agent.js';
import type { AgentEventSink, AgentRunOptions } from '../runtime/types.js';
import { ToolRegistry } from '../tools/registry.js';
import { VerificationEngine } from '../verification/engine.js';

export interface PlanExecutorOptions {
  provider: ModelProvider;
  workspaceRoot: string;
  tools?: ToolRegistry | undefined;
  verificationEngine?: VerificationEngine | undefined;
  debuggingEngine?: DebuggingEngine | undefined;
  database?: EvolveDatabaseInstance | undefined;
  memoryService?: MemoryService | undefined;
  feedbackService?: FeedbackService | undefined;
  evaluationEngine?: EvaluationEngine | undefined;
  eventSink?: AgentEventSink | undefined;
  logger?: Logger | undefined;
  maxDebugAttempts?: number | undefined;
}

export interface ExecutePlanRequestOptions extends PlanExecutionOptions {
  signal?: AbortSignal | undefined;
  onTaskProgress?: ((task: PlanTask, status: TaskStatus) => void) | undefined;
}

export class PlanExecutor {
  private readonly provider: ModelProvider;
  private readonly workspaceRoot: string;
  private readonly tools: ToolRegistry;
  private readonly verificationEngine: VerificationEngine;
  private readonly debuggingEngine: DebuggingEngine;
  private readonly database?: EvolveDatabaseInstance | undefined;
  private readonly planRepo?: PlanRepository | undefined;
  private readonly memoryService?: MemoryService | undefined;
  private readonly memoryRetriever?: MemoryRetriever | undefined;
  private readonly memoryConsolidator?: MemoryConsolidator | undefined;
  private readonly memoryExtractor?: MemoryExtractor | undefined;
  private readonly feedbackService?: FeedbackService | undefined;
  private readonly evaluationEngine?: EvaluationEngine | undefined;
  private readonly eventSink?: AgentEventSink | undefined;
  private readonly logger: Logger;
  private readonly internalBus: InMemoryEventBus;

  constructor(options: PlanExecutorOptions) {
    this.provider = options.provider;
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.tools = options.tools ?? new ToolRegistry().registerDefaultTools();
    this.verificationEngine = options.verificationEngine ?? new VerificationEngine();
    this.debuggingEngine =
      options.debuggingEngine ??
      new DebuggingEngine({
        provider: this.provider,
        verificationEngine: this.verificationEngine,
        tools: this.tools,
        maxAttempts: options.maxDebugAttempts ?? 3,
      });

    this.database = options.database;
    if (this.database?.db) {
      this.planRepo = new PlanRepository(this.database.db);
    }

    this.memoryService =
      options.memoryService ??
      (options.database?.sqlite
        ? new MemoryService(options.database.db, options.database.sqlite)
        : undefined);

    if (this.memoryService) {
      this.memoryRetriever = new MemoryRetriever({ memoryService: this.memoryService });
      this.memoryConsolidator = new MemoryConsolidator(this.memoryService);
      this.memoryExtractor = new MemoryExtractor(this.memoryConsolidator);
    }

    this.feedbackService =
      options.feedbackService ??
      (options.database?.db ? new FeedbackService(options.database.db) : undefined);

    this.evaluationEngine =
      options.evaluationEngine ??
      new EvaluationEngine({
        feedbackService: this.feedbackService,
        memoryService: this.memoryService,
      });

    this.eventSink = options.eventSink;
    this.logger = options.logger ?? noopLogger;
    this.internalBus = new InMemoryEventBus();
  }

  public getEventBus(): InMemoryEventBus {
    return this.internalBus;
  }

  /**
   * Executes an approved implementation plan sequentially adhering to its DAG task dependencies.
   */
  public async executePlan(
    plan: Plan,
    options: ExecutePlanRequestOptions = {},
  ): Promise<PlanExecutionResult> {
    const startTime = Date.now();
    const sessionId: SessionId = (plan.sessionId || createSessionId()) as SessionId;

    // 1. Pre-execution checks: approval verification
    if (plan.status !== 'approved' && !options.autoApprove) {
      const errorMsg = `Plan '${plan.planId}' is in status '${plan.status}' and has not been approved for execution.`;
      return {
        planId: plan.planId,
        sessionId,
        status: 'failed',
        durationMs: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        tasks: [],
        error: errorMsg,
      };
    }

    // 2. Build and validate DAG
    let taskOrder: string[] = [];
    let dag: DirectedAcyclicGraph;

    try {
      dag = new DirectedAcyclicGraph(plan.tasks);
      const validation = dag.validate();
      if (!validation.valid) {
        return {
          planId: plan.planId,
          sessionId,
          status: 'failed',
          durationMs: 0,
          tasksCompleted: 0,
          tasksFailed: 0,
          tasks: [],
          error: `DAG Validation failed: ${validation.errors.join('; ')}`,
        };
      }
      taskOrder = dag.getTopologicalOrder();
    } catch (err) {
      return {
        planId: plan.planId,
        sessionId,
        status: 'failed',
        durationMs: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        tasks: [],
        error: `Failed to construct task DAG: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 3. Mark plan in progress in DB and emit execution_started
    if (this.planRepo) {
      try {
        this.planRepo.updateStatus(plan.planId, 'in_progress');
      } catch (err) {
        this.logger.warn(`Failed to update plan status in DB: ${String(err)}`);
      }
    }

    this.emitEvent(sessionId, 'execution_started', {
      planId: plan.planId,
      sessionId,
      totalTasks: plan.tasks.length,
      mode: plan.mode,
    });

    const taskMap = new Map<string, PlanTask>(plan.tasks.map((t) => [t.id, t]));
    const completedTaskIds = new Set<string>();
    const failedTaskIds = new Set<string>();
    const taskResults: TaskExecutionResult[] = [];
    const stopOnFailure = options.stopOnFailure ?? true;

    // 4. Execute tasks in topological order
    for (let taskIndex = 0; taskIndex < taskOrder.length; taskIndex++) {
      const taskId = taskOrder[taskIndex]!;
      const task = taskMap.get(taskId)!;

      // Check cancellation signal
      if (options.signal?.aborted) {
        this.emitEvent(sessionId, 'execution_cancelled', {
          planId: plan.planId,
          reason: 'Execution cancelled by user or signal',
          completedTasks: completedTaskIds.size,
          remainingTasks: taskOrder.length - completedTaskIds.size,
        });

        if (this.planRepo) {
          try {
            this.planRepo.updateStatus(plan.planId, 'failed');
            this.planRepo.updateTaskStatus(plan.planId, taskId, 'cancelled');
          } catch {
            // DB update failure non-fatal
          }
        }

        return {
          planId: plan.planId,
          sessionId,
          status: 'cancelled',
          durationMs: Date.now() - startTime,
          tasksCompleted: completedTaskIds.size,
          tasksFailed: failedTaskIds.size,
          tasks: taskResults,
          error: 'Execution cancelled by signal.',
        };
      }

      // Check prerequisites
      const prerequisites = dag.getPrerequisites(taskId);
      const unsatisfied = prerequisites.filter((p) => !completedTaskIds.has(p));

      if (unsatisfied.length > 0) {
        const errorMsg = `Task '${task.title}' is blocked by incomplete prerequisites: ${unsatisfied.join(', ')}`;
        this.updateTaskState(plan.planId, task, 'blocked', options.onTaskProgress);

        this.emitEvent(sessionId, 'task_failed', {
          planId: plan.planId,
          taskId: task.id,
          error: errorMsg,
          recoverable: false,
        });

        failedTaskIds.add(taskId);
        taskResults.push({
          taskId,
          status: 'failed',
          durationMs: 0,
          filesModified: [],
          verifications: [],
          error: errorMsg,
        });

        if (stopOnFailure) {
          break;
        }
        continue;
      }

      // Transition to running
      const taskStartTime = Date.now();
      this.updateTaskState(plan.planId, task, 'running', options.onTaskProgress);

      this.emitEvent(sessionId, 'task_started', {
        planId: plan.planId,
        taskId: task.id,
        taskIndex,
        title: task.title,
        riskLevel: task.estimatedRisk,
      });

      // Execute task via AgentRuntime
      const taskExecution = await this.executeSingleTask(
        plan,
        task,
        sessionId,
        options,
      );

      taskResults.push(taskExecution);

      if (taskExecution.status === 'completed') {
        completedTaskIds.add(taskId);
        this.updateTaskState(plan.planId, task, 'completed', options.onTaskProgress);

        this.emitEvent(sessionId, 'task_completed', {
          planId: plan.planId,
          taskId: task.id,
          durationMs: Date.now() - taskStartTime,
          filesModified: taskExecution.filesModified,
        });
      } else {
        failedTaskIds.add(taskId);
        this.updateTaskState(plan.planId, task, 'failed', options.onTaskProgress);

        this.emitEvent(sessionId, 'task_failed', {
          planId: plan.planId,
          taskId: task.id,
          error: taskExecution.error ?? 'Task execution or verification failed.',
          recoverable: false,
        });

        if (stopOnFailure) {
          break;
        }
      }
    }

    // 5. Compute overall execution result
    const overallSuccess =
      failedTaskIds.size === 0 && completedTaskIds.size === plan.tasks.length;
    const finalStatus = overallSuccess ? 'completed' : 'failed';
    const totalDurationMs = Date.now() - startTime;

    if (this.planRepo) {
      try {
        this.planRepo.updateStatus(plan.planId, finalStatus);
      } catch (err) {
        this.logger.warn(`Failed to update final plan status in DB: ${String(err)}`);
      }
    }

    this.emitEvent(sessionId, 'execution_completed', {
      planId: plan.planId,
      sessionId,
      success: overallSuccess,
      durationMs: totalDurationMs,
      tasksCompleted: completedTaskIds.size,
      tasksFailed: failedTaskIds.size,
    });

    const planResult: PlanExecutionResult = {
      planId: plan.planId,
      sessionId,
      status: finalStatus,
      durationMs: totalDurationMs,
      tasksCompleted: completedTaskIds.size,
      tasksFailed: failedTaskIds.size,
      tasks: taskResults,
      ...(!overallSuccess ? { error: `Execution finished with ${failedTaskIds.size} failed task(s).` } : {}),
    };

    if (this.memoryExtractor) {
      try {
        const candidates = this.memoryExtractor.extractFromExecution(plan, planResult, {
          projectId: plan.projectId,
          sessionId,
        });
        if (candidates.length > 0) {
          const saved = this.memoryExtractor.consolidateAll(candidates);
          for (const mem of saved) {
            this.emitEvent(sessionId, 'memory_created', {
              memoryId: mem.id,
              category: mem.category,
              key: mem.key,
              projectId: mem.projectId ?? undefined,
              confidence: mem.confidence,
              status: mem.verificationStatus,
            });
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to extract execution memories: ${String(err)}`);
      }
    }

    return planResult;
  }

  private async executeSingleTask(
    plan: Plan,
    task: PlanTask,
    sessionId: SessionId,
    options: ExecutePlanRequestOptions,
  ): Promise<TaskExecutionResult> {
    const taskStartTime = Date.now();
    const filesModified = new Set<string>();
    const verifications: VerificationResult[] = [];

    // Construct runtime prompt
    const prompt = this.formatTaskPrompt(task);

    // Retrieve relevant memories
    const memoryResult = this.memoryRetriever?.retrieve({
      prompt,
      projectId: plan.projectId,
      relevantFiles: task.relevantFiles,
    });

    // Initialize agent runtime for this task
    const runtime = new AgentRuntime({
      provider: this.provider,
      tools: this.tools,
      config: {
        workspaceRoot: this.workspaceRoot,
        maxSteps: 12,
        maxContextTokens: 64_000,
        systemPrompt:
          'You are Evolve autonomous software engineer. You are executing a specific planned task. Safely inspect relevant files, apply minimal necessary changes, and verify your modifications.',
      },
      logger: this.logger,
    });

    // Wire runtime tool events to plan execution events
    runtime.on('tool_call', (evt) => {
      this.emitEvent(sessionId, 'tool_call_requested', {
        planId: plan.planId,
        taskId: task.id,
        toolName: evt.payload.toolName,
        args: evt.payload.arguments,
      });

      this.emitEvent(sessionId, 'tool_execution_started', {
        planId: plan.planId,
        taskId: task.id,
        toolName: evt.payload.toolName,
        toolCallId: evt.payload.toolCallId,
      });

      // Track modified files
      if (
        ['write_file', 'create_file', 'edit_file', 'delete_file'].includes(
          evt.payload.toolName,
        )
      ) {
        const filePath = evt.payload.arguments['path'];
        if (typeof filePath === 'string') {
          filesModified.add(filePath);
        }
      }
    });

    runtime.on('tool_result', (evt) => {
      if (evt.payload.success) {
        this.emitEvent(sessionId, 'tool_execution_completed', {
          planId: plan.planId,
          taskId: task.id,
          toolName: evt.payload.toolName,
          toolCallId: evt.payload.toolCallId,
          durationMs: 0,
          success: true,
          outputSummary: evt.payload.output?.slice(0, 200),
        });
      } else {
        this.emitEvent(sessionId, 'tool_execution_failed', {
          planId: plan.planId,
          taskId: task.id,
          toolName: evt.payload.toolName,
          toolCallId: evt.payload.toolCallId,
          error: evt.payload.error ?? 'Tool execution failed',
        });
      }
    });

    const runOpts: AgentRunOptions = {
      sessionId,
      signal: options.signal,
      memories: memoryResult?.memories,
    };

    const runRes = await runtime.run(prompt, runOpts);

    if (!runRes.success) {
      const runErr = runRes.error ?? 'Agent runtime encountered an error during task execution.';
      const evalReport = this.evaluationEngine?.evaluateTask({
        plan,
        task,
        sessionId,
        projectId: plan.projectId,
        verifications,
        filesModified: Array.from(filesModified),
        runtimeError: runErr,
      });

      return {
        taskId: task.id,
        status: 'failed',
        durationMs: Date.now() - taskStartTime,
        filesModified: Array.from(filesModified),
        verifications,
        evaluationId: evalReport?.id,
        error: runErr,
      };
    }

    // Run verification if enabled
    if (options.verifyAfterTask !== false) {
      this.emitEvent(sessionId, 'verification_started', {
        planId: plan.planId,
        taskId: task.id,
        stage: 'task_verification',
      });

      const verifReport = await this.verificationEngine.verify(this.workspaceRoot, {
        customTestCommand: options.customTestCommand,
        signal: options.signal,
      });

      verifications.push(...verifReport.results);

      for (const res of verifReport.results) {
        this.emitEvent(sessionId, 'verification_completed', {
          planId: plan.planId,
          taskId: task.id,
          stage: String(res.stage),
          success: res.success,
          durationMs: res.durationMs,
          ...(res.errorTrace ? { error: res.errorTrace } : {}),
        });
      }

      // If verification failed, attempt debugging recovery
      if (!verifReport.passed && verifReport.failedStage) {
        this.logger.info(
          `Verification failed for task '${task.id}'. Initiating automated debugging loop...`,
        );

        const debugResult = await this.debuggingEngine.attemptRecovery({
          taskTitle: task.title,
          taskObjective: task.objective,
          workspaceRoot: this.workspaceRoot,
          failedResult: verifReport.failedStage,
          relevantFiles: Array.from(filesModified),
          signal: options.signal,
          verificationOptions: {
            customTestCommand: options.customTestCommand,
            signal: options.signal,
          },
        });

        if (!debugResult.recovered) {
          const finalErr =
            debugResult.finalError ??
            'Automated verification and debugging failed to fix test/build errors.';

          const evalReport = this.evaluationEngine?.evaluateTask({
            plan,
            task,
            sessionId,
            projectId: plan.projectId,
            verifications,
            filesModified: Array.from(filesModified),
            runtimeError: finalErr,
          });

          return {
            taskId: task.id,
            status: 'failed',
            durationMs: Date.now() - taskStartTime,
            filesModified: Array.from(filesModified),
            verifications,
            evaluationId: evalReport?.id,
            error: finalErr,
          };
        }
      }
    }

    const evalReport = this.evaluationEngine?.evaluateTask({
      plan,
      task,
      sessionId,
      projectId: plan.projectId,
      verifications,
      filesModified: Array.from(filesModified),
    });

    return {
      taskId: task.id,
      status: 'completed',
      durationMs: Date.now() - taskStartTime,
      filesModified: Array.from(filesModified),
      verifications,
      evaluationId: evalReport?.id,
    };
  }

  private updateTaskState(
    planId: string,
    task: PlanTask,
    status: TaskStatus,
    onProgress?: (task: PlanTask, status: TaskStatus) => void,
  ): void {
    task.status = status;
    if (this.planRepo) {
      try {
        this.planRepo.updateTaskStatus(planId, task.id, status);
      } catch {
        // non-fatal
      }
    }
    if (onProgress) {
      try {
        onProgress(task, status);
      } catch {
        // non-fatal
      }
    }
  }

  private formatTaskPrompt(task: PlanTask): string {
    const parts = [
      `Task: ${task.title}`,
      `Objective: ${task.objective}`,
      `Description: ${task.description}`,
    ];

    if (task.relevantFiles && task.relevantFiles.length > 0) {
      parts.push(`Relevant Files:\n${task.relevantFiles.map((f) => `- ${f}`).join('\n')}`);
    }

    if (task.expectedChanges && task.expectedChanges.length > 0) {
      parts.push(`Expected Changes:\n${task.expectedChanges.map((c) => `- ${c}`).join('\n')}`);
    }

    if (task.verificationSteps && task.verificationSteps.length > 0) {
      parts.push(`Verification Steps:\n${task.verificationSteps.map((v) => `- ${v}`).join('\n')}`);
    }

    parts.push(
      '',
      'Instructions:',
      '1. Review any relevant files using read_file or list_files.',
      '2. Implement the changes using edit_file, write_file, or create_file.',
      '3. Maintain minimal diffs and avoid modifying unrelated code.',
    );

    return parts.join('\n');
  }

  private emitEvent<T extends CoreEventType>(
    sessionId: SessionId,
    type: T,
    payload: EventInputPayloadMap[T],
  ): void {
    const envelope: EventEnvelope<T> = {
      id: createToolCallId(),
      sessionId,
      type,
      timestamp: Date.now(),
      payload: payload as EventEnvelope<T>['payload'],
    };

    // Emit to internal event bus
    this.internalBus.emit(type, envelope);

    // Forward to external event sink
    if (this.eventSink) {
      if ('publish' in this.eventSink) {
        this.eventSink.publish(sessionId, type, payload);
      } else if ('emit' in this.eventSink) {
        this.eventSink.emit(type, envelope);
      }
    }
  }
}

