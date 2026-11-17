import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ModelMessage, ModelProvider, ModelResponse } from '@evolve/core';
import { initDatabase, type EvolveDatabaseInstance, ProjectRepository, SessionRepository } from '@evolve/db';
import { PlanningEngine } from './planner.js';
import { TaskUnderstandingEngine } from './task-understanding.js';

class MockDeterministicProvider implements ModelProvider {
  public readonly name = 'mock-planner-provider';
  private responses: string[] = [];

  constructor(responses: string[]) {
    this.responses = [...responses];
  }

  public setResponses(responses: string[]): void {
    this.responses = [...responses];
  }

  public async generate(messages: readonly ModelMessage[]): Promise<ModelResponse> {
    const next = this.responses.shift();
    if (!next) {
      throw new Error('MockDeterministicProvider ran out of configured responses');
    }

    return {
      id: 'resp_mock',
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content: next,
      },
    };
  }

  public async *stream(): AsyncIterable<any> {
    // unused in planning
  }
}

describe('PlanningEngine & Sub-Engines', () => {
  let dbInstance: EvolveDatabaseInstance;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;

  beforeEach(() => {
    dbInstance = initDatabase({ path: ':memory:' });
    projectRepo = new ProjectRepository(dbInstance.db);
    sessionRepo = new SessionRepository(dbInstance.db);

    projectRepo.create({
      id: 'proj_planner_test',
      name: 'Planner Test Project',
      path: process.cwd(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    sessionRepo.create({
      id: 'sess_planner_test',
      projectId: 'proj_planner_test',
      goal: 'Test Planning',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  afterEach(() => {
    dbInstance.close();
  });

  it('TaskUnderstandingEngine parses and extracts structured requirements', async () => {
    const mockOutput = JSON.stringify({
      primaryObjective: 'Add JWT Authentication',
      expectedOutcome: 'Secure endpoints with Bearer tokens',
      functionalRequirements: ['Register user', 'Authenticate login', 'Verify token in middleware'],
      technicalConstraints: ['Use bcrypt for password hashing', 'Sign tokens with RS256'],
      relevantComponents: ['src/routes/auth.ts', 'src/middleware/jwt.ts'],
      potentialAmbiguities: ['Token expiry duration not specified'],
      missingInformation: ['Choice of secret vs private key'],
      acceptanceCriteria: ['Unit tests for token generation', 'Integration tests for login route'],
    });

    const provider = new MockDeterministicProvider([`\`\`\`json\n${mockOutput}\n\`\`\``]);
    const engine = new TaskUnderstandingEngine(provider);

    const reqs = await engine.analyzeRequest('Add JWT authentication to my Express app');
    expect(reqs.primaryObjective).toBe('Add JWT Authentication');
    expect(reqs.functionalRequirements.length).toBe(3);
    expect(reqs.missingInformation).toContain('Choice of secret vs private key');
  });

  it('TaskUnderstandingEngine recovers from surrounding conversational text', async () => {
    const mockOutput = `Certainly! Here are the extracted requirements:\n\n{\n  "primaryObjective": "Refactor database",\n  "expectedOutcome": "Use SQLite WAL",\n  "functionalRequirements": [],\n  "technicalConstraints": [],\n  "relevantComponents": [],\n  "potentialAmbiguities": [],\n  "missingInformation": [],\n  "acceptanceCriteria": []\n}\n\nHope this helps!`;

    const provider = new MockDeterministicProvider([mockOutput]);
    const engine = new TaskUnderstandingEngine(provider);

    const reqs = await engine.analyzeRequest('Refactor database');
    expect(reqs.primaryObjective).toBe('Refactor database');
  });

  it('PlanningEngine creates and persists a full DAG plan', async () => {
    const mockRequirements = JSON.stringify({
      primaryObjective: 'Add JWT Authentication',
      expectedOutcome: 'Protected API routes',
      functionalRequirements: ['Register', 'Login'],
      technicalConstraints: [],
      relevantComponents: [],
      potentialAmbiguities: [],
      missingInformation: [],
      acceptanceCriteria: ['Tests pass'],
    });

    const mockPlan = JSON.stringify({
      title: 'Plan: Add JWT Authentication',
      objective: 'Secure API with JWT',
      assumptions: ['User model exists'],
      tasks: [
        {
          id: 'task_1',
          title: 'Design user auth model',
          description: 'Add password hash',
          objective: 'Store credentials securely',
          relevantFiles: ['src/models/user.ts'],
          expectedChanges: ['Add password_hash column'],
          dependencies: [],
          verificationSteps: ['Check schema'],
          estimatedComplexity: 'low',
          estimatedRisk: 'low',
        },
        {
          id: 'task_2',
          title: 'Implement token utility',
          description: 'Create sign and verify functions',
          objective: 'JWT token lifecycle',
          relevantFiles: ['src/utils/jwt.ts'],
          expectedChanges: ['signToken, verifyToken'],
          dependencies: ['task_1'],
          verificationSteps: ['Unit tests'],
          estimatedComplexity: 'medium',
          estimatedRisk: 'low',
        },
        {
          id: 'task_3',
          title: 'Auth middleware',
          description: 'Extract and verify Bearer token',
          objective: 'Protect API endpoints',
          relevantFiles: ['src/middleware/auth.ts'],
          expectedChanges: ['Check authorization header'],
          dependencies: ['task_2'],
          verificationSteps: ['Verify 401 on missing token'],
          estimatedComplexity: 'medium',
          estimatedRisk: 'low',
        },
      ],
      risks: {
        overallRisk: 'low',
        overallComplexity: 'medium',
        summary: 'Standard token auth',
        criticalRisks: [],
        recommendations: ['Use env vars for secret'],
        securityConsiderations: ['Rotate keys'],
        dataMigrationConsiderations: [],
        testingRequirements: ['Test expired token rejection'],
      },
      acceptanceCriteria: ['All auth tests pass'],
      estimatedComplexity: 'medium',
    });

    const provider = new MockDeterministicProvider([mockRequirements, mockPlan]);

    const engine = new PlanningEngine({
      provider,
      db: dbInstance.db,
      sqlite: dbInstance.sqlite,
      rootDir: process.cwd(),
      projectId: 'proj_planner_test',
    });

    const plan = await engine.createPlan({
      userPrompt: 'Add JWT Authentication',
      sessionId: 'sess_planner_test',
      mode: 'detailed',
    });

    expect(plan.planId.startsWith('plan_')).toBe(true);
    expect(plan.tasks.length).toBe(3);
    expect(plan.dependencies.length).toBe(2);
    expect(plan.status).toBe('awaiting_approval');

    // Retrieve from DB
    const persisted = engine.getPlan(plan.planId);
    expect(persisted).toBeDefined();
    expect(persisted?.title).toBe('Plan: Add JWT Authentication');
  });

  it('Supports explicit approval and rejection without auto-executing', async () => {
    const mockRequirements = JSON.stringify({
      primaryObjective: 'Small Fix',
      expectedOutcome: 'Fix bug',
      functionalRequirements: [],
      technicalConstraints: [],
      relevantComponents: [],
      potentialAmbiguities: [],
      missingInformation: [],
      acceptanceCriteria: [],
    });

    const mockPlan = JSON.stringify({
      title: 'Fix Bug Plan',
      objective: 'Fix bug',
      assumptions: [],
      tasks: [
        {
          id: 'task_1',
          title: 'Update bug line',
          description: 'Fix off by one',
          objective: 'Correct index',
          dependencies: [],
        },
      ],
      risks: {
        overallRisk: 'low',
        overallComplexity: 'low',
        summary: 'Low risk fix',
        criticalRisks: [],
        recommendations: [],
        securityConsiderations: [],
        dataMigrationConsiderations: [],
        testingRequirements: [],
      },
      acceptanceCriteria: ['Test passes'],
      estimatedComplexity: 'low',
    });

    const provider = new MockDeterministicProvider([mockRequirements, mockPlan]);

    const engine = new PlanningEngine({
      provider,
      db: dbInstance.db,
      sqlite: dbInstance.sqlite,
      rootDir: process.cwd(),
      projectId: 'proj_planner_test',
    });

    const plan = await engine.createPlan({
      userPrompt: 'Fix bug',
      sessionId: 'sess_planner_test',
      mode: 'quick',
    });

    expect(plan.status).toBe('awaiting_approval');

    // Approve
    const approved = await engine.approvePlan(plan.planId, 'Approved by team lead');
    expect(approved.status).toBe('approved');

    // Check DB reflects approved status
    const fromDb = engine.getPlan(plan.planId);
    expect(fromDb?.status).toBe('approved');
  });

  it('Handles bounded self-repair when model returns malformed JSON on first attempt', async () => {
    const mockRequirements = JSON.stringify({
      primaryObjective: 'Test Self Repair',
      expectedOutcome: 'Done',
      functionalRequirements: [],
      technicalConstraints: [],
      relevantComponents: [],
      potentialAmbiguities: [],
      missingInformation: [],
      acceptanceCriteria: [],
    });

    const invalidJson = `{ title: "Malformed", invalid json syntax ... `;
    const validJson = JSON.stringify({
      title: 'Repaired Plan',
      objective: 'Fixed',
      assumptions: [],
      tasks: [
        {
          id: 'task_1',
          title: 'Repaired Task',
          description: 'Valid task',
          objective: 'Test self repair',
          dependencies: [],
        },
      ],
      risks: {
        overallRisk: 'low',
        overallComplexity: 'low',
        summary: 'Ok',
        criticalRisks: [],
        recommendations: [],
        securityConsiderations: [],
        dataMigrationConsiderations: [],
        testingRequirements: [],
      },
      acceptanceCriteria: [],
      estimatedComplexity: 'low',
    });

    const provider = new MockDeterministicProvider([mockRequirements, invalidJson, validJson]);

    const engine = new PlanningEngine({
      provider,
      db: dbInstance.db,
      sqlite: dbInstance.sqlite,
      rootDir: process.cwd(),
      projectId: 'proj_planner_test',
    });

    const plan = await engine.createPlan({
      userPrompt: 'Test self repair',
      sessionId: 'sess_planner_test',
    });

    expect(plan.title).toBe('Repaired Plan');
  });

  it('Supports editing tasks and tracks revisions', async () => {
    const mockRequirements = JSON.stringify({
      primaryObjective: 'Edit Task Plan',
      expectedOutcome: 'Done',
      functionalRequirements: [],
      technicalConstraints: [],
      relevantComponents: [],
      potentialAmbiguities: [],
      missingInformation: [],
      acceptanceCriteria: [],
    });

    const mockPlan = JSON.stringify({
      title: 'Initial Plan',
      objective: 'Test edit',
      assumptions: [],
      tasks: [
        {
          id: 'task_1',
          title: 'Original Title',
          description: 'Original Desc',
          objective: 'Initial',
          dependencies: [],
        },
      ],
      risks: {
        overallRisk: 'low',
        overallComplexity: 'low',
        summary: '',
        criticalRisks: [],
        recommendations: [],
        securityConsiderations: [],
        dataMigrationConsiderations: [],
        testingRequirements: [],
      },
      acceptanceCriteria: [],
      estimatedComplexity: 'low',
    });

    const provider = new MockDeterministicProvider([mockRequirements, mockPlan]);

    const engine = new PlanningEngine({
      provider,
      db: dbInstance.db,
      sqlite: dbInstance.sqlite,
      rootDir: process.cwd(),
      projectId: 'proj_planner_test',
    });

    const plan = await engine.createPlan({
      userPrompt: 'Initial test',
      sessionId: 'sess_planner_test',
    });

    expect(plan.revision).toBe(1);

    // Edit task
    const edited = await engine.editTask(plan.planId, 'task_1', {
      title: 'Updated Title via UI',
      estimatedComplexity: 'high',
    });

    expect(edited.revision).toBe(2);
    expect(edited.tasks[0]?.title).toBe('Updated Title via UI');
    expect(edited.tasks[0]?.estimatedComplexity).toBe('high');

    const revisions = engine.getPlanRevisions(plan.planId);
    expect(revisions.length).toBe(2);
  });
});
