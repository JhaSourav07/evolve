import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CoreEventType, Plan, PlanTask } from '@evolve/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockModelProvider } from '../providers/mock.js';
import { VerificationEngine } from '../verification/engine.js';
import { PlanExecutor } from './plan-executor.js';

describe('PlanExecutor', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-plan-executor-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function createTestPlan(overrides: Partial<Plan> = {}): Plan {
    const tasks: PlanTask[] = [
      {
        id: 'task_1',
        title: 'Task 1: Setup database schema',
        description: 'Initialize tables',
        objective: 'Create schema file',
        relevantFiles: ['src/db.ts'],
        expectedChanges: ['Add schema definition'],
        dependencies: [],
        verificationSteps: ['Run typecheck'],
        estimatedComplexity: 'low',
        estimatedRisk: 'low',
        potentialRisks: [],
        affectedComponents: ['db'],
        breakingChange: false,
        status: 'pending',
      },
      {
        id: 'task_2',
        title: 'Task 2: Implement service',
        description: 'Implement auth service using db',
        objective: 'Create auth service',
        relevantFiles: ['src/auth.ts'],
        expectedChanges: ['Add login and signup'],
        dependencies: ['task_1'],
        verificationSteps: ['Run tests'],
        estimatedComplexity: 'medium',
        estimatedRisk: 'low',
        potentialRisks: [],
        affectedComponents: ['auth'],
        breakingChange: false,
        status: 'pending',
      },
    ];

    return {
      planId: 'plan_test_1',
      sessionId: 'sess_test_1',
      projectId: 'proj_test_1',
      title: 'Authentication Feature',
      objective: 'Implement end to end auth',
      mode: 'detailed',
      requirements: {
        primaryObjective: 'Auth',
        expectedOutcome: 'Working auth',
        functionalRequirements: [],
        technicalConstraints: [],
        relevantComponents: [],
        potentialAmbiguities: [],
        missingInformation: [],
        acceptanceCriteria: [],
      },
      assumptions: [],
      tasks,
      dependencies: [{ fromTaskId: 'task_1', toTaskId: 'task_2' }],
      risks: {
        overallRisk: 'low',
        overallComplexity: 'medium',
        summary: 'Low risk feature',
        criticalRisks: [],
        recommendations: [],
        securityConsiderations: [],
        dataMigrationConsiderations: [],
        testingRequirements: [],
      },
      acceptanceCriteria: ['Tests pass'],
      estimatedComplexity: 'medium',
      status: 'approved',
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    };
  }

  it('rejects execution of unapproved plans when autoApprove is false', async () => {
    const mockProvider = new MockModelProvider();
    const executor = new PlanExecutor({
      provider: mockProvider,
      workspaceRoot: tmpDir,
    });

    const unapprovedPlan = createTestPlan({ status: 'awaiting_approval' });
    const result = await executor.executePlan(unapprovedPlan, { autoApprove: false });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('has not been approved for execution');
    expect(result.tasksCompleted).toBe(0);
  });

  it('executes tasks in topological order and emits lifecycle events', async () => {
    const mockProvider = new MockModelProvider();
    // Task 1 response
    mockProvider.enqueueResponse({
      content: 'Task 1 completed successfully.',
      finishReason: 'stop',
    });
    // Task 2 response
    mockProvider.enqueueResponse({
      content: 'Task 2 completed successfully.',
      finishReason: 'stop',
    });

    const verificationEngine = new VerificationEngine();
    vi.spyOn(verificationEngine, 'verify').mockResolvedValue({
      passed: true,
      totalDurationMs: 50,
      results: [
        {
          stage: 'typecheck',
          command: 'tsc',
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 50,
        },
      ],
    });

    const eventsEmitted: Array<{ type: CoreEventType; payload: Record<string, unknown> }> = [];
    const executor = new PlanExecutor({
      provider: mockProvider,
      workspaceRoot: tmpDir,
      verificationEngine,
    });

    executor.getEventBus().onAny((envelope) => {
      eventsEmitted.push({
        type: envelope.type,
        payload: envelope.payload as Record<string, unknown>,
      });
    });

    const executedOrder: string[] = [];
    const plan = createTestPlan();

    const result = await executor.executePlan(plan, {
      onTaskProgress: (task, status) => {
        if (status === 'running') {
          executedOrder.push(task.id);
        }
      },
    });

    // Verify topological order: task_1 must run before task_2
    expect(executedOrder).toEqual(['task_1', 'task_2']);
    expect(result.status).toBe('completed');
    expect(result.tasksCompleted).toBe(2);
    expect(result.tasksFailed).toBe(0);

    // Verify lifecycle events
    const eventTypes = eventsEmitted.map((e) => e.type);
    expect(eventTypes).toContain('execution_started');
    expect(eventTypes).toContain('task_started');
    expect(eventTypes).toContain('verification_started');
    expect(eventTypes).toContain('verification_completed');
    expect(eventTypes).toContain('task_completed');
    expect(eventTypes).toContain('execution_completed');
  });

  it('blocks dependent tasks if prerequisite task fails', async () => {
    const mockProvider = new MockModelProvider();
    // Task 1 fails verification
    mockProvider.enqueueResponse({
      content: 'Tried to implement task 1.',
      finishReason: 'stop',
    });

    const verificationEngine = new VerificationEngine();
    vi.spyOn(verificationEngine, 'verify').mockResolvedValue({
      passed: false,
      totalDurationMs: 50,
      results: [
        {
          stage: 'test',
          command: 'pnpm test',
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'Broken test',
          durationMs: 50,
        },
      ],
      failedStage: {
        stage: 'test',
        command: 'pnpm test',
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'Broken test',
        durationMs: 50,
      },
    });

    const executor = new PlanExecutor({
      provider: mockProvider,
      workspaceRoot: tmpDir,
      verificationEngine,
      maxDebugAttempts: 1,
    });

    const plan = createTestPlan();
    // Allow continuation on failure to test blocking
    const result = await executor.executePlan(plan, { stopOnFailure: false });

    expect(result.status).toBe('failed');
    expect(result.tasksCompleted).toBe(0);
    expect(result.tasksFailed).toBe(2); // task_1 failed, task_2 blocked
  });

  it('handles cancellation signal cleanly', async () => {
    const mockProvider = new MockModelProvider();
    const abortController = new AbortController();
    abortController.abort(); // Pre-aborted

    const executor = new PlanExecutor({
      provider: mockProvider,
      workspaceRoot: tmpDir,
    });

    const plan = createTestPlan();
    const result = await executor.executePlan(plan, { signal: abortController.signal });

    expect(result.status).toBe('cancelled');
    expect(result.tasksCompleted).toBe(0);
  });

  it('extracts and records persistent memory when plan execution completes with database', async () => {
    const { initDatabase, ProjectRepository, MemoryService, resetTestDatabase } = await import('@evolve/db');
    const { db, sqlite, close } = initDatabase({ path: path.join(tmpDir, 'test.db') });
    resetTestDatabase(sqlite);

    const projectRepo = new ProjectRepository(db);
    projectRepo.create({
      id: 'proj_plan_mem',
      name: 'Plan Memory Project',
      path: tmpDir,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const memoryService = new MemoryService(db, sqlite);
    const mockProvider = new MockModelProvider();
    mockProvider.enqueueResponse({
      finishReason: 'stop',
      message: { role: 'assistant', content: 'Database schema created successfully.' },
    });
    mockProvider.enqueueResponse({
      finishReason: 'stop',
      message: { role: 'assistant', content: 'Auth service implemented.' },
    });

    const executor = new PlanExecutor({
      provider: mockProvider,
      workspaceRoot: tmpDir,
      memoryService,
    });

    const emittedEvents: string[] = [];
    executor.getEventBus().onAny((evt) => {
      emittedEvents.push(evt.type);
    });

    const plan = createTestPlan({ projectId: 'proj_plan_mem' });
    const result = await executor.executePlan(plan);

    expect(result.status).toBe('completed');
    expect(result.tasksCompleted).toBe(2);

    // Verify memories were saved and emitted
    expect(emittedEvents).toContain('memory_created');
    const experiences = memoryService.listExperiences('proj_plan_mem');
    expect(experiences.length).toBeGreaterThanOrEqual(1);

    close();
  });
});

