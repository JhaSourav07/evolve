import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanId } from '@evolve/core';
import { runPlanCommand } from './commands/plan.js';
import { CliContext } from './context.js';
import { buildCli } from './index.js';

describe('Plan Command Tests', () => {
  let tempDir: string;
  let context: CliContext;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'evolve-plan-cmd-test-'));
    context = new CliContext({ rootDir: tempDir });
  });

  afterEach(() => {
    context.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('buildCli registers the plan command with appropriate options', () => {
    const cli = buildCli();
    const planCmd = cli.commands.find((c) => c.name() === 'plan');
    expect(planCmd).toBeDefined();
    expect(planCmd?.description()).toContain('implementation plans');

    const options = planCmd?.options.map((o) => o.long);
    expect(options).toContain('--mode');
    expect(options).toContain('--approve');
    expect(options).toContain('--reject');
    expect(options).toContain('--history');
    expect(options).toContain('--model');
  });

  it('runPlanCommand --history prints when no plans exist', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runPlanCommand(undefined, { history: true, rootDir: tempDir });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No implementation plans found'),
    );

    consoleSpy.mockRestore();
  });

  it('runPlanCommand --approve and --reject manage plan status', async () => {
    // Seed a plan directly via context
    const planRepo = context.planRepo;
    const planId = 'plan_test_cmd_1' as PlanId;
    const sessionId = context.createSession('Plan session');

    planRepo.create({
      planId,
      sessionId,
      projectId: context.projectId,
      title: 'Test Plan Command',
      objective: 'Verify CLI plan operations',
      mode: 'detailed',
      status: 'awaiting_approval',
      revision: 1,
      estimatedComplexity: 'low',
      requirements: {
        primaryObjective: 'Verify CLI operations',
        expectedOutcome: 'Approved plan',
        functionalRequirements: ['Requirement 1'],
        technicalConstraints: [],
        relevantComponents: [],
        potentialAmbiguities: [],
        missingInformation: [],
        acceptanceCriteria: ['All tests pass'],
      },
      tasks: [
        {
          id: 'task_1',
          title: 'Initial setup',
          description: 'Set up verification environment',
          objective: 'Setup',
          relevantFiles: ['src/index.ts'],
          expectedChanges: [],
          dependencies: [],
          verificationSteps: ['pnpm test'],
          estimatedComplexity: 'low',
          estimatedRisk: 'low',
          potentialRisks: [],
          affectedComponents: [],
          breakingChange: false,
          status: 'pending',
        },
      ],
      dependencies: [],
      risks: {
        overallRisk: 'low',
        overallComplexity: 'low',
        summary: 'Safe test plan',
        criticalRisks: [],
        recommendations: [],
        securityConsiderations: [],
        dataMigrationConsiderations: [],
        testingRequirements: [],
      },
      acceptanceCriteria: ['Tests pass'],
      assumptions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Approve
    await runPlanCommand(undefined, { approve: planId, rootDir: tempDir });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('approved successfully'));

    let updated = planRepo.findById(planId);
    expect(updated?.status).toBe('approved');

    // Reject
    await runPlanCommand(undefined, { reject: planId, rootDir: tempDir });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('rejected'));

    updated = planRepo.findById(planId);
    expect(updated?.status).toBe('rejected');

    // History lists this plan
    await runPlanCommand(undefined, { history: true, rootDir: tempDir });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test Plan Command'));

    consoleSpy.mockRestore();
  });
});
