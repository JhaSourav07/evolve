import { describe, expect, it } from 'vitest';
import { createPlanId, createTaskId, isPlanId, isTaskId } from '../ids/index.js';
import { PlanSchema, PlanTaskSchema } from './schema.js';

describe('Planning Core Schemas & IDs', () => {
  it('creates and validates strongly-typed IDs', () => {
    const planId = createPlanId();
    expect(planId.startsWith('plan_')).toBe(true);
    expect(isPlanId(planId)).toBe(true);
    expect(isPlanId('invalid_id')).toBe(false);

    const taskId = createTaskId(1);
    expect(taskId).toBe('task_1');
    expect(isTaskId(taskId)).toBe(true);
    expect(isTaskId('wrong_id')).toBe(false);
  });

  it('validates a well-formed PlanTask', () => {
    const validTask = PlanTaskSchema.parse({
      id: 'task_1',
      title: 'Inspect repository structure',
      description: 'Analyze modules and exports',
      objective: 'Discover relevant controllers and routes',
      relevantFiles: ['src/app.ts'],
      expectedChanges: [],
      dependencies: [],
      verificationSteps: ['Verify app.ts parses'],
      estimatedComplexity: 'low',
      estimatedRisk: 'low',
      potentialRisks: [],
    });

    expect(validTask.id).toBe('task_1');
    expect(validTask.status).toBe('pending');
  });

  it('validates and applies defaults to complete PlanSchema', () => {
    const plan = PlanSchema.parse({
      planId: createPlanId(),
      sessionId: 'sess_123',
      projectId: 'proj_456',
      title: 'Implement JWT Auth',
      objective: 'Add user login and token middleware',
      mode: 'detailed',
      requirements: {
        primaryObjective: 'Add JWT Auth',
        expectedOutcome: 'Users can register and receive JWT',
        functionalRequirements: ['Register', 'Login'],
        technicalConstraints: ['Use bcrypt'],
        relevantComponents: ['auth/'],
        potentialAmbiguities: [],
        missingInformation: [],
        acceptanceCriteria: ['Tests pass'],
      },
      tasks: [
        {
          id: 'task_1',
          title: 'Design auth models',
          description: 'Create user schema',
          objective: 'Define fields',
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(plan.status).toBe('awaiting_approval');
    expect(plan.revision).toBe(1);
    expect(plan.tasks.length).toBe(1);
    expect(plan.risks.overallRisk).toBe('medium');
  });

  it('rejects a plan with zero tasks', () => {
    expect(() =>
      PlanSchema.parse({
        planId: 'plan_1',
        sessionId: 'sess_1',
        projectId: 'proj_1',
        title: 'Empty plan',
        objective: 'Do nothing',
        requirements: {
          primaryObjective: 'None',
          expectedOutcome: 'None',
        },
        tasks: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    ).toThrow();
  });
});

