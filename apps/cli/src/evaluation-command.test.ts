import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskEvaluationReport } from '@evolve/core';
import { runEvaluateCommand } from './commands/evaluate.js';
import { runFeedbackCommand } from './commands/feedback.js';
import { CliContext } from './context.js';
import { buildCli } from './index.js';

describe('CLI Evaluate and Multi-Level Feedback Commands', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'evolve-eval-cmd-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('runs evaluate list and inspect on recorded evaluations', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const context = new CliContext({ rootDir: tempDir });
    const sessionId = context.createSession('Test Session');

    context.dbInstance.sqlite
      .prepare(
        `INSERT INTO plans (id, session_id, project_id, title, objective, mode, status, revision, requirements_json, assumptions_json, risks_json, acceptance_criteria_json, estimated_complexity, overall_risk, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'plan_test_001',
        sessionId,
        context.projectId,
        'Test Plan',
        'Test Objective',
        'detailed',
        'approved',
        1,
        '[]',
        '[]',
        '{"overallRisk":"low"}',
        '[]',
        'low',
        'low',
        Date.now(),
        Date.now(),
      );

    const evalReport: TaskEvaluationReport = {
      id: 'eval_test_001',
      projectId: context.projectId,
      sessionId,
      planId: 'plan_test_001',
      taskId: 'task_test_001',
      taskTitle: 'Implement JWT authentication',
      overallStatus: 'verified',
      requirementCoverage: 'complete',
      testStatus: 'passed',
      buildStatus: 'passed',
      typecheckStatus: 'passed',
      lintStatus: 'passed',
      gitDiffStatus: 'clean',
      dimensions: [
        {
          dimension: 'functional_correctness',
          result: 'positive',
          supportingEvidence: 'Unit tests passed 5/5',
          confidence: 0.95,
          source: 'automated_verification',
        },
      ],
      failures: [],
      evidenceSummary: { totalTests: 5, passedTests: 5 },
      markdownReport: '# Evaluation Report\nAll passed.',
      userFeedbackStatus: 'pending',
      trainingEligible: true,
      createdAt: Date.now(),
    };

    context.feedbackService.recordEvaluation(evalReport);
    context.close();

    // 1. List evaluations
    await expect(runEvaluateCommand({ subcommand: 'list' })).resolves.not.toThrow();

    // 2. Inspect evaluation
    await expect(
      runEvaluateCommand({ subcommand: 'inspect', args: ['eval_test_001'] }),
    ).resolves.not.toThrow();

    // 3. Filter by plan
    await expect(
      runEvaluateCommand({ subcommand: 'plan', args: ['plan_test_001'] }),
    ).resolves.not.toThrow();

    // 4. Filter by task
    await expect(
      runEvaluateCommand({ subcommand: 'task', args: ['task_test_001'] }),
    ).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('queries training candidates via evaluate training', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const context = new CliContext({ rootDir: tempDir });
    const sessionId = context.createSession('Candidate Session');

    const evalReport: TaskEvaluationReport = {
      id: 'eval_cand_001',
      projectId: context.projectId,
      sessionId,
      taskTitle: 'Candidate Task',
      overallStatus: 'verified',
      requirementCoverage: 'complete',
      testStatus: 'passed',
      buildStatus: 'passed',
      typecheckStatus: 'passed',
      lintStatus: 'passed',
      gitDiffStatus: 'clean',
      dimensions: [],
      failures: [],
      evidenceSummary: {},
      markdownReport: '# Candidate',
      userFeedbackStatus: 'pending',
      trainingEligible: true,
      createdAt: Date.now(),
    };

    context.feedbackService.recordEvaluation(evalReport);
    context.close();

    await expect(
      runEvaluateCommand({ subcommand: 'training' }),
    ).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('records response, action, and task feedback', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const context = new CliContext({ rootDir: tempDir });
    const sessionId = context.createSession('Feedback Session');

    // Create a tool call to link action feedback
    context.dbInstance.sqlite
      .prepare(
        `INSERT INTO tool_calls (id, session_id, tool_name, arguments, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('tc_feed_001', sessionId, 'bash', '{"command":"ls"}', 'completed', Date.now());
    context.close();

    // 1. Response feedback
    await expect(
      runFeedbackCommand({
        subcommand: 'response',
        rating: '1',
        notes: 'Great response',
      }),
    ).resolves.not.toThrow();

    // 2. Action feedback
    await expect(
      runFeedbackCommand({
        subcommand: 'action',
        args: ['tc_feed_001', 'correct_tool_selection'],
        notes: 'Correct tool selected',
      }),
    ).resolves.not.toThrow();

    // 3. Task feedback
    await expect(
      runFeedbackCommand({
        subcommand: 'task',
        args: ['task_test_001'],
        taskRatings: '5,5,4,5,5',
        notes: 'High quality implementation',
      }),
    ).resolves.not.toThrow();

    // 4. List feedback history
    await expect(runFeedbackCommand({ subcommand: 'list' })).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('registers evaluate and feedback commands in Commander CLI', () => {
    const cli = buildCli();
    const evaluateCmd = cli.commands.find((c) => c.name() === 'evaluate');
    const feedbackCmd = cli.commands.find((c) => c.name() === 'feedback');

    expect(evaluateCmd).toBeDefined();
    expect(feedbackCmd).toBeDefined();
  });
});
