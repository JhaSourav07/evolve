import type Database from 'better-sqlite3';
import {
  type CoreEventType,
  type EventInputPayloadMap,
  type ModelProvider,
  type Plan,
  type PlanMode,
  type PlanStatus,
  type PlanTask,
  type StructuredRequirements,
  createPlanId,
} from '@evolve/core';
import { PlanRepository, type EvolveDatabase, type PlanRevisionRow } from '@evolve/db';
import { DirectedAcyclicGraph } from '../dag/graph.js';
import { TaskDecompositionEngine } from './decomposition.js';
import { RepoContextCollector, type RepositoryEvidence } from './repo-context.js';
import { TaskUnderstandingEngine } from './task-understanding.js';

export interface PlannerEventSink {
  publish<T extends CoreEventType>(
    sessionId: string,
    type: T,
    payload: EventInputPayloadMap[T],
  ): unknown;
}

export interface PlanningEngineOptions {
  provider: ModelProvider;
  db: EvolveDatabase;
  sqlite: Database.Database;
  rootDir: string;
  projectId: string;
  eventSink?: PlannerEventSink | undefined;
}

export interface CreatePlanRequest {
  userPrompt: string;
  sessionId: string;
  mode?: PlanMode | undefined;
  signal?: AbortSignal | undefined;
}

export class PlanningEngine {
  private readonly provider: ModelProvider;
  private readonly db: EvolveDatabase;
  private readonly sqlite: Database.Database;
  private readonly rootDir: string;
  private readonly projectId: string;
  private readonly eventSink?: PlannerEventSink | undefined;

  private readonly understandingEngine: TaskUnderstandingEngine;
  private readonly contextCollector: RepoContextCollector;
  private readonly decompositionEngine: TaskDecompositionEngine;
  private readonly planRepo: PlanRepository;

  constructor(options: PlanningEngineOptions) {
    this.provider = options.provider;
    this.db = options.db;
    this.sqlite = options.sqlite;
    this.rootDir = options.rootDir;
    this.projectId = options.projectId;
    this.eventSink = options.eventSink;

    this.understandingEngine = new TaskUnderstandingEngine(this.provider);
    this.contextCollector = new RepoContextCollector(this.sqlite, this.rootDir);
    this.decompositionEngine = new TaskDecompositionEngine(this.provider);
    this.planRepo = new PlanRepository(this.db);
  }

  /**
   * Generates a repository-aware implementation plan from a natural-language request.
   * Safety invariant: NEVER executes terminal commands or modifies project files.
   */
  public async createPlan(request: CreatePlanRequest): Promise<Plan> {
    const mode: PlanMode = request.mode ?? 'detailed';

    // 1. Collect repository context and evidence
    const evidence: RepositoryEvidence = await this.contextCollector.collectEvidence(
      request.userPrompt,
      this.projectId,
      mode === 'quick' ? { maxTokens: 1200, maxFiles: 3 } : { maxTokens: 2500, maxFiles: 6 },
    );

    // 2. Extract structured requirements
    const requirements: StructuredRequirements = await this.understandingEngine.analyzeRequest(
      request.userPrompt,
      {
        provider: this.provider,
        projectOverview: evidence.contextSummary,
        existingConventions: evidence.existingConventions,
        signal: request.signal,
      },
    );

    // 3. Decompose into structured DAG plan
    const plan: Plan = await this.decompositionEngine.generatePlan(
      request.userPrompt,
      requirements,
      evidence,
      {
        sessionId: request.sessionId,
        projectId: this.projectId,
        mode,
        provider: this.provider,
        signal: request.signal,
      },
    );

    // 4. Persist to database
    this.planRepo.create(plan);

    // 5. Emit plan_created event
    this.emitEvent(request.sessionId, 'plan_created', {
      planId: plan.planId,
      title: plan.title,
      taskCount: plan.tasks.length,
      mode: plan.mode,
      estimatedComplexity: plan.estimatedComplexity,
      overallRisk: plan.risks.overallRisk,
    });

    return plan;
  }

  /**
   * Explicitly approves a plan.
   * Note: An approved plan is marked approved but NEVER automatically executed in Phase 2.
   */
  public async approvePlan(planId: string, notes?: string): Promise<Plan> {
    const plan = this.planRepo.findById(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    if (plan.status === 'approved') {
      return plan;
    }

    this.planRepo.updateStatus(planId, 'approved');

    const updatedPlan: Plan = {
      ...plan,
      status: 'approved',
      updatedAt: Date.now(),
    };

    this.emitEvent(plan.sessionId, 'plan_approved', {
      planId,
      approvedAt: Date.now(),
      notes,
    });

    return updatedPlan;
  }

  /**
   * Explicitly rejects a plan.
   */
  public async rejectPlan(planId: string, reason?: string): Promise<Plan> {
    const plan = this.planRepo.findById(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    this.planRepo.updateStatus(planId, 'rejected');

    const updatedPlan: Plan = {
      ...plan,
      status: 'rejected',
      updatedAt: Date.now(),
    };

    this.emitEvent(plan.sessionId, 'plan_rejected', {
      planId,
      rejectedAt: Date.now(),
      reason,
    });

    return updatedPlan;
  }

  /**
   * Edits a specific task within an existing plan, recalculates DAG validity,
   * updates the plan revision, and preserves the snapshot history.
   */
  public async editTask(
    planId: string,
    taskId: string,
    updates: Partial<Omit<PlanTask, 'id'>>,
    changeSummary: string = `Edited task ${taskId}`,
  ): Promise<Plan> {
    const plan = this.planRepo.findById(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const taskIndex = plan.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex < 0) {
      throw new Error(`Task not found in plan: ${taskId}`);
    }

    const currentTask = plan.tasks[taskIndex]!;
    const updatedTask: PlanTask = {
      ...currentTask,
      ...updates,
      id: taskId, // preserve immutable ID
    };

    const newTasks = [...plan.tasks];
    newTasks[taskIndex] = updatedTask;

    // Validate DAG constraints
    const dag = new DirectedAcyclicGraph(newTasks);
    const validation = dag.validate();
    if (!validation.valid) {
      throw new Error(`Cannot update task: DAG validation failed: ${validation.errors.join('; ')}`);
    }

    const updatedDependencies: Array<{ fromTaskId: string; toTaskId: string }> = [];
    for (const t of newTasks) {
      for (const depId of t.dependencies) {
        updatedDependencies.push({ fromTaskId: depId, toTaskId: t.id });
      }
    }

    const updatedPlan: Plan = {
      ...plan,
      revision: plan.revision + 1,
      tasks: newTasks,
      dependencies: updatedDependencies,
      status: 'awaiting_approval', // editing resets approval state
      updatedAt: Date.now(),
    };

    this.planRepo.updatePlan(updatedPlan, changeSummary);

    this.emitEvent(plan.sessionId, 'plan_updated', {
      planId,
      changesSummary: changeSummary,
      revision: updatedPlan.revision + 1,
    });

    return updatedPlan;
  }

  /**
   * Regenerates a new draft plan with user feedback while marking the previous plan superseded.
   */
  public async regeneratePlan(
    previousPlanId: string,
    feedback?: string,
    signal?: AbortSignal,
  ): Promise<Plan> {
    const prev = this.planRepo.findById(previousPlanId);
    if (!prev) {
      throw new Error(`Previous plan not found: ${previousPlanId}`);
    }

    const augmentedPrompt = feedback
      ? `${prev.objective}\n\nUser feedback on previous plan: ${feedback}`
      : prev.objective;

    const newPlan = await this.createPlan({
      userPrompt: augmentedPrompt,
      sessionId: prev.sessionId,
      mode: prev.mode,
      signal,
    });

    // Mark previous plan as superseded
    this.planRepo.updateStatus(previousPlanId, 'superseded');

    this.emitEvent(prev.sessionId, 'plan_regenerated', {
      previousPlanId,
      newPlanId: newPlan.planId,
      feedback,
    });

    return newPlan;
  }

  public getPlan(planId: string): Plan | undefined {
    return this.planRepo.findById(planId);
  }

  public listPlans(projectId: string = this.projectId): Plan[] {
    return this.planRepo.findByProjectId(projectId);
  }

  public getPlanRevisions(planId: string): PlanRevisionRow[] {
    return this.planRepo.getRevisions(planId);
  }

  private emitEvent<T extends CoreEventType>(
    sessionId: string,
    type: T,
    payload: EventInputPayloadMap[T],
  ): void {
    if (this.eventSink && typeof this.eventSink.publish === 'function') {
      this.eventSink.publish(sessionId, type, payload);
    }
  }
}
