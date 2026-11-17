import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Plan } from '@evolve/core';
import { initDatabase, type EvolveDatabaseInstance } from '../connection.js';
import { PlanRepository } from './plan.js';
import { ProjectRepository } from './project.js';
import { SessionRepository } from './session.js';

describe('PlanRepository & Migration 004', () => {
  let dbInstance: EvolveDatabaseInstance;
  let planRepo: PlanRepository;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;

  beforeEach(() => {
    dbInstance = initDatabase({ path: ':memory:' });
    planRepo = new PlanRepository(dbInstance.db);
    projectRepo = new ProjectRepository(dbInstance.db);
    sessionRepo = new SessionRepository(dbInstance.db);

    projectRepo.create({
      id: 'proj_test',
      name: 'Test Project',
      path: '/test/path',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    sessionRepo.create({
      id: 'sess_test',
      projectId: 'proj_test',
      goal: 'Add Auth',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  afterEach(() => {
    dbInstance.close();
  });

  const samplePlan: Plan = {
    planId: 'plan_123',
    sessionId: 'sess_test',
    projectId: 'proj_test',
    title: 'Implement JWT Authentication',
    objective: 'Add user auth, tokens, and middleware',
    mode: 'detailed',
    status: 'awaiting_approval',
    revision: 1,
    requirements: {
      primaryObjective: 'JWT Authentication',
      expectedOutcome: 'Secure endpoints',
      functionalRequirements: ['Register', 'Login'],
      technicalConstraints: ['Use bcrypt'],
      relevantComponents: ['auth'],
      potentialAmbiguities: [],
      missingInformation: [],
      acceptanceCriteria: ['Tests pass'],
    },
    assumptions: ['User table exists'],
    tasks: [
      {
        id: 'task_1',
        title: 'User schema',
        description: 'Define schema',
        objective: 'Add password hash field',
        status: 'pending',
        estimatedComplexity: 'low',
        estimatedRisk: 'low',
        relevantFiles: ['src/models/user.ts'],
        expectedChanges: ['Add password_hash'],
        dependencies: [],
        verificationSteps: ['Run tests'],
        potentialRisks: [],
        affectedComponents: ['User Model'],
        breakingChange: false,
      },
      {
        id: 'task_2',
        title: 'JWT Service',
        description: 'Generate and verify tokens',
        objective: 'Token creation',
        status: 'pending',
        estimatedComplexity: 'medium',
        estimatedRisk: 'low',
        relevantFiles: ['src/services/jwt.ts'],
        expectedChanges: ['Add sign and verify methods'],
        dependencies: ['task_1'],
        verificationSteps: ['Test token validity'],
        potentialRisks: [],
        affectedComponents: ['Auth Service'],
        breakingChange: false,
      },
    ],
    dependencies: [{ fromTaskId: 'task_1', toTaskId: 'task_2' }],
    risks: {
      overallRisk: 'medium',
      overallComplexity: 'medium',
      summary: 'Authentication changes require secure secrets',
      criticalRisks: ['Secret leakage'],
      recommendations: ['Store JWT_SECRET in environment'],
      securityConsiderations: ['Use strong salt rounds'],
      dataMigrationConsiderations: [],
      testingRequirements: ['Unit and integration tests'],
    },
    acceptanceCriteria: ['Pass unit tests'],
    estimatedComplexity: 'medium',
    createdAt: 1000,
    updatedAt: 1000,
  };

  it('creates and retrieves a plan with tasks and dependencies', () => {
    planRepo.create(samplePlan);

    const retrieved = planRepo.findById('plan_123');
    expect(retrieved).toBeDefined();
    expect(retrieved?.title).toBe('Implement JWT Authentication');
    expect(retrieved?.tasks.length).toBe(2);
    expect(retrieved?.tasks[0]?.id).toBe('task_1');
    expect(retrieved?.tasks[1]?.dependencies).toEqual(['task_1']);
    expect(retrieved?.dependencies.length).toBe(1);
    expect(retrieved?.dependencies[0]).toEqual({
      fromTaskId: 'task_1',
      toTaskId: 'task_2',
    });
  });

  it('lists plans by session and project ID', () => {
    planRepo.create(samplePlan);

    const bySession = planRepo.findBySessionId('sess_test');
    expect(bySession.length).toBe(1);

    const byProject = planRepo.findByProjectId('proj_test');
    expect(byProject.length).toBe(1);
  });

  it('updates plan status', () => {
    planRepo.create(samplePlan);
    planRepo.updateStatus('plan_123', 'approved');

    const updated = planRepo.findById('plan_123');
    expect(updated?.status).toBe('approved');
  });

  it('updates plan tasks and preserves revision history', () => {
    planRepo.create(samplePlan);

    const modifiedPlan: Plan = {
      ...samplePlan,
      title: 'Updated JWT Plan',
      tasks: [
        ...samplePlan.tasks,
        {
          id: 'task_3',
          title: 'Auth Middleware',
          description: 'Protect routes',
          objective: 'Validate Bearer token',
          status: 'pending',
          estimatedComplexity: 'low',
          estimatedRisk: 'low',
          relevantFiles: ['src/middleware/auth.ts'],
          expectedChanges: ['Check req.headers.authorization'],
          dependencies: ['task_2'],
          verificationSteps: ['Test 401 response'],
          potentialRisks: [],
          affectedComponents: ['API Gateway'],
          breakingChange: false,
        },
      ],
    };

    planRepo.updatePlan(modifiedPlan, 'Added Auth Middleware task');

    const retrieved = planRepo.findById('plan_123');
    expect(retrieved?.revision).toBe(2);
    expect(retrieved?.tasks.length).toBe(3);

    const revisions = planRepo.getRevisions('plan_123');
    expect(revisions.length).toBe(2);
    expect(revisions[0]?.revision).toBe(2);
    expect(revisions[0]?.changeSummary).toBe('Added Auth Middleware task');
    expect(revisions[1]?.revision).toBe(1);
  });
});
