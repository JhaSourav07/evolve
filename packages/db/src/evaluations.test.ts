import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDatabase, resetTestDatabase } from './connection.js';
import { FeedbackService } from './feedback/service.js';
import { ProjectRepository } from './repositories/project.js';
import { SessionRepository } from './repositories/session.js';
import { ToolCallRepository } from './repositories/tool_call.js';
import type { TaskEvaluationReport } from './feedback/types.js';

describe('Evaluation & Multi-Level Feedback Service', () => {
  let tmpDir: string;
  let closeDb: () => void;
  let service: FeedbackService;
  let sessionId: string;
  const projectId = 'proj_eval_test';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-eval-test-'));
    const { db, sqlite, close } = initDatabase({ path: path.join(tmpDir, 'test.db') });
    closeDb = close;
    resetTestDatabase(sqlite);
    service = new FeedbackService(db);

    const projectRepo = new ProjectRepository(db);
    projectRepo.create({
      id: projectId,
      name: 'Evaluation Test Project',
      path: tmpDir,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const sessionRepo = new SessionRepository(db);
    sessionId = 'sess_eval_1';
    sessionRepo.create({
      id: sessionId,
      projectId,
      goal: 'Implement token bucket rate limiter',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('records response-level feedback with semantic rating labels', () => {
    const fb = service.recordResponseFeedback({
      sessionId,
      rating: 'correct',
      notes: 'Clean explanation of rate limiting algorithm',
      isTechnicallyCorrect: true,
    });

    expect(fb.id).toBeDefined();
    expect(fb.feedbackLevel).toBe('response');
    expect(fb.rating).toBe(1);
    expect(fb.ratingLabel).toBe('correct');
    expect(fb.isTechnicallyCorrect).toBe(true);

    const retrieved = service.findById(fb.id);
    expect(retrieved?.notes).toContain('rate limiting');
  });

  it('records action-level feedback on specific tool calls', () => {
    // 1. Tool call must exist for foreign key
    const toolCallRepo = new ToolCallRepository((service as any).db);
    toolCallRepo.recordCall({
      id: 'tc_read_1',
      sessionId,
      toolName: 'read_file',
      arguments: JSON.stringify({ path: 'src/limiter.ts' }),
      createdAt: Date.now(),
    });

    const fb = service.recordActionFeedback({
      sessionId,
      toolCallId: 'tc_read_1',
      actionRating: 'correct_tool_selection',
      notes: 'Read the correct file on first attempt',
      isTechnicallyCorrect: true,
    });

    expect(fb.feedbackLevel).toBe('action');
    expect(fb.actionRating).toBe('correct_tool_selection');
    expect(fb.toolCallId).toBe('tc_read_1');
    expect(fb.rating).toBe(1);

    const byTool = service.listByToolCall('tc_read_1');
    expect(byTool.length).toBe(1);
    expect(byTool[0]?.actionRating).toBe('correct_tool_selection');
  });

  it('records task-level multi-dimensional ratings and links with evaluation', () => {
    const fb = service.recordTaskFeedback({
      sessionId,
      taskId: 'task_rate_limiter',
      evaluationId: 'eval_123',
      ratings: {
        requirementSatisfaction: 5,
        codeQuality: 4,
        architecture: 5,
        correctness: 5,
        completeness: 4,
        overallRating: 5,
      },
      notes: 'Exceeded expectations, included unit tests with 100% branch coverage',
    });

    expect(fb.feedbackLevel).toBe('task');
    expect(fb.targetId).toBe('task_rate_limiter');
    expect(fb.rating).toBe(1);
    expect(fb.taskRatingsJson).toContain('"requirementSatisfaction":5');

    const byTarget = service.listByTarget('task_rate_limiter');
    expect(byTarget.length).toBe(1);
  });

  it('stores and retrieves automated task evaluation reports with quality dimensions', () => {
    const mockReport: TaskEvaluationReport = {
      id: 'eval_mock_1',
      projectId,
      sessionId,
      taskId: 'task_api_pagination',
      taskTitle: 'Implement API pagination',
      overallStatus: 'verified',
      requirementCoverage: 'complete',
      testStatus: 'passed',
      buildStatus: 'passed',
      typecheckStatus: 'passed',
      lintStatus: 'passed',
      gitDiffStatus: 'reviewed',
      dimensions: [
        {
          dimension: 'functional_correctness',
          result: 'positive',
          supportingEvidence: 'All 6 unit tests passed',
          confidence: 0.95,
          source: 'automated_verification',
        },
        {
          dimension: 'security_considerations',
          result: 'positive',
          supportingEvidence: 'No secret leakage detected and input sanitized',
          confidence: 0.9,
          source: 'static_analysis',
        },
      ],
      failures: [],
      evidenceSummary: { passedTests: 6, modifiedFiles: ['src/routes/api.ts'] },
      markdownReport: '# EVOLVE TASK EVALUATION\n\nTask: Implement API pagination\nOverall: Verified',
      userFeedbackStatus: 'pending',
      trainingEligible: true,
      trainingEligibilityReason: 'All verifications passed with complete requirement coverage',
      createdAt: Date.now(),
    };

    service.recordEvaluation(mockReport);

    const retrieved = service.getEvaluation('eval_mock_1');
    expect(retrieved).toBeDefined();
    expect(retrieved?.overallStatus).toBe('verified');
    expect(retrieved?.dimensions.length).toBe(2);
    expect(retrieved?.dimensions[0]?.dimension).toBe('functional_correctness');
    expect(retrieved?.trainingEligible).toBe(true);

    const byTask = service.getEvaluationByTaskId('task_api_pagination');
    expect(byTask?.id).toBe('eval_mock_1');
  });

  it('queries training data candidates partitioned into SFT and DPO categories', () => {
    // 1. Successful verified evaluation
    service.recordEvaluation({
      id: 'eval_succ_1',
      projectId,
      sessionId,
      taskId: 'task_success',
      taskTitle: 'Successful Task',
      overallStatus: 'verified',
      requirementCoverage: 'complete',
      testStatus: 'passed',
      buildStatus: 'passed',
      typecheckStatus: 'passed',
      lintStatus: 'passed',
      gitDiffStatus: 'reviewed',
      dimensions: [],
      failures: [],
      evidenceSummary: {},
      markdownReport: 'Success report',
      userFeedbackStatus: 'pending',
      trainingEligible: true,
      createdAt: Date.now(),
    });

    // 2. Failed evaluation
    service.recordEvaluation({
      id: 'eval_fail_1',
      projectId,
      sessionId,
      taskId: 'task_failed',
      taskTitle: 'Failed Task',
      overallStatus: 'failed',
      requirementCoverage: 'partial',
      testStatus: 'failed',
      buildStatus: 'passed',
      typecheckStatus: 'passed',
      lintStatus: 'passed',
      gitDiffStatus: 'reviewed',
      dimensions: [],
      failures: [
        {
          category: 'test_failure',
          explanation: 'Assertion error in rate_limiter.test.ts',
        },
      ],
      evidenceSummary: {},
      markdownReport: 'Failure report',
      userFeedbackStatus: 'pending',
      trainingEligible: false,
      createdAt: Date.now(),
    });

    const candidates = service.queryTrainingCandidates({ projectId });
    expect(candidates.length).toBe(2);

    const sftItem = candidates.find((c) => c.pairType === 'sft_demonstration');
    expect(sftItem).toBeDefined();
    expect(sftItem?.isSuccessful).toBe(true);

    const dpoRejected = candidates.find((c) => c.pairType === 'dpo_rejected');
    expect(dpoRejected).toBeDefined();
    expect(dpoRejected?.isSuccessful).toBe(false);
  });

  it('filters training candidates by verificationStatus, failureCategory, and minRating', () => {
    // 1. Verified task
    service.recordEvaluation({
      id: 'eval_filter_v',
      projectId,
      sessionId,
      taskId: 'task_v',
      taskTitle: 'Verified Task',
      overallStatus: 'verified',
      requirementCoverage: 'complete',
      testStatus: 'passed',
      buildStatus: 'passed',
      typecheckStatus: 'passed',
      lintStatus: 'passed',
      gitDiffStatus: 'reviewed',
      dimensions: [
        {
          dimension: 'functional_correctness',
          result: 'positive',
          supportingEvidence: 'All tests green',
          confidence: 1.0,
          source: 'automated_verification',
        },
      ],
      failures: [],
      evidenceSummary: {},
      markdownReport: 'Verified',
      userFeedbackStatus: 'pending',
      trainingEligible: true,
      createdAt: Date.now(),
    });

    // 2. Failed task with build_failure
    service.recordEvaluation({
      id: 'eval_filter_f',
      projectId,
      sessionId,
      taskId: 'task_f',
      taskTitle: 'Build Failure Task',
      overallStatus: 'failed',
      requirementCoverage: 'missing',
      testStatus: 'none',
      buildStatus: 'failed',
      typecheckStatus: 'failed',
      lintStatus: 'none',
      gitDiffStatus: 'reviewed',
      dimensions: [],
      failures: [
        {
          category: 'build_failure',
          explanation: 'Syntax error in index.ts',
        },
      ],
      evidenceSummary: {},
      markdownReport: 'Failed',
      userFeedbackStatus: 'pending',
      trainingEligible: false,
      createdAt: Date.now() + 10,
    });

    // Record human feedback for task_f
    service.recordTaskFeedback({
      sessionId,
      taskId: 'task_f',
      ratings: {
        requirementSatisfaction: 1,
        codeQuality: 1,
        architecture: 1,
        correctness: 1,
        completeness: 1,
        overallRating: 1,
      },
      notes: 'Broken build',
    });

    // Filter by verificationStatus: 'verified'
    const verifiedOnly = service.queryTrainingCandidates({
      projectId,
      verificationStatus: 'verified',
    });
    expect(verifiedOnly.length).toBe(1);
    expect(verifiedOnly[0]?.evaluationId).toBe('eval_filter_v');

    // Filter by failureCategories: ['build_failure']
    const buildFailures = service.queryTrainingCandidates({
      projectId,
      failureCategories: ['build_failure'],
    });
    expect(buildFailures.length).toBe(1);
    expect(buildFailures[0]?.evaluationId).toBe('eval_filter_f');

    // Filter by minRating: 1 (should exclude task_f with rating -1)
    const positiveOnly = service.queryTrainingCandidates({
      projectId,
      minRating: 1,
    });
    expect(positiveOnly.some((c) => c.evaluationId === 'eval_filter_f')).toBe(false);

    // Query without projectId (listAll)
    const allCandidates = service.queryTrainingCandidates();
    expect(allCandidates.length).toBeGreaterThanOrEqual(2);
  });
});
