import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ModelMessage, ModelProvider, ModelResponse } from '@evolve/core';
import { initDatabase, type EvolveDatabaseInstance, ProjectRepository, SessionRepository } from '@evolve/db';
import { PlanningEngine } from './planner.js';

class MockSafetyProvider implements ModelProvider {
  public readonly name = 'mock-safety-provider';

  public async generate(messages: readonly ModelMessage[]): Promise<ModelResponse> {
    const isRequirement = messages[0]?.content.includes('Task Understanding Engine');

    if (isRequirement) {
      return {
        id: 'resp_safety_req',
        finishReason: 'stop',
        message: {
          role: 'assistant',
          content: JSON.stringify({
            primaryObjective: 'Safe objective',
            expectedOutcome: 'Safe outcome',
            functionalRequirements: ['Requirement 1'],
            technicalConstraints: [],
            relevantComponents: [],
            potentialAmbiguities: [],
            missingInformation: [],
            acceptanceCriteria: ['Passes'],
          }),
        },
      };
    }

    return {
      id: 'resp_safety_plan',
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content: JSON.stringify({
          title: 'Safe Read-Only Plan',
          objective: 'Inspect and plan only',
          assumptions: [],
          tasks: [
            {
              id: 'task_1',
              title: 'Read existing source',
              description: 'Inspect without writing',
              objective: 'Analysis',
              dependencies: [],
            },
          ],
          risks: {
            overallRisk: 'low',
            overallComplexity: 'low',
            summary: 'Safe',
            criticalRisks: [],
            recommendations: [],
            securityConsiderations: [],
            dataMigrationConsiderations: [],
            testingRequirements: [],
          },
          acceptanceCriteria: ['Clean inspection'],
          estimatedComplexity: 'low',
        }),
      },
    };
  }

  public async *stream(): AsyncIterable<any> {}
}

describe('Planning Engine Safety Constraints', () => {
  let dbInstance: EvolveDatabaseInstance;
  let tempDir: string;

  beforeEach(() => {
    dbInstance = initDatabase({ path: ':memory:' });
    tempDir = fs.mkdtempSync(path.join(process.cwd(), '.test-safety-'));

    // Create a mock file in tempDir
    fs.writeFileSync(path.join(tempDir, 'sample.ts'), 'export const secret = "super-secret";\n', 'utf8');

    const projectRepo = new ProjectRepository(dbInstance.db);
    projectRepo.create({
      id: 'proj_safety',
      name: 'Safety Project',
      path: tempDir,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const sessionRepo = new SessionRepository(dbInstance.db);
    sessionRepo.create({
      id: 'sess_safety',
      projectId: 'proj_safety',
      goal: 'Safety check',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  afterEach(() => {
    dbInstance.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('Guarantees planning is strictly read-only and never modifies project files', async () => {
    const fileBefore = fs.readFileSync(path.join(tempDir, 'sample.ts'), 'utf8');
    const mtimeBefore = fs.statSync(path.join(tempDir, 'sample.ts')).mtimeMs;

    const engine = new PlanningEngine({
      provider: new MockSafetyProvider(),
      db: dbInstance.db,
      sqlite: dbInstance.sqlite,
      rootDir: tempDir,
      projectId: 'proj_safety',
    });

    // Run planning even with malicious injection attempts in prompt
    const plan = await engine.createPlan({
      userPrompt: 'rm -rf / && modify sample.ts && echo "injected" > sample.ts',
      sessionId: 'sess_safety',
      mode: 'detailed',
    });

    expect(plan.status).toBe('awaiting_approval');

    // Verify sample.ts was completely untouched
    const fileAfter = fs.readFileSync(path.join(tempDir, 'sample.ts'), 'utf8');
    const mtimeAfter = fs.statSync(path.join(tempDir, 'sample.ts')).mtimeMs;

    expect(fileAfter).toBe(fileBefore);
    expect(mtimeAfter).toBe(mtimeBefore);
  });
});
