import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PlanTask, VerificationResult } from '@evolve/core';
import { FeedbackService, initDatabase, MemoryService, ProjectRepository, resetTestDatabase } from '@evolve/db';
import { EvaluationEngine } from './engine.js';
import { FailureClassifier } from './failure-classifier.js';
import { QualityEvaluator } from './quality-evaluator.js';

describe('Evaluation & Quality Engine', () => {
  let tmpDir: string;
  let closeDb: () => void;
  let memoryService: MemoryService;
  let feedbackService: FeedbackService;
  let projectRepo: ProjectRepository;
  let engine: EvaluationEngine;

  const mockTask: PlanTask = {
    id: 'task_pagination',
    title: 'Implement API pagination',
    description: 'Add limit and offset query params to user list route',
    objective: 'Implement pagination for API',
    relevantFiles: ['src/routes/users.ts'],
    expectedChanges: ['Update users router'],
    dependencies: [],
    verificationSteps: ['pnpm test users.test.ts'],
    estimatedComplexity: 'low',
    estimatedRisk: 'low',
    potentialRisks: [],
    affectedComponents: ['routes'],
    breakingChange: false,
    status: 'completed',
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-agent-eval-test-'));
    const { db, sqlite, close } = initDatabase({ path: path.join(tmpDir, 'test.db') });
    closeDb = close;
    resetTestDatabase(sqlite);
    projectRepo = new ProjectRepository(db);
    projectRepo.create({
      id: 'proj_agent_test',
      name: 'Agent Test Project',
      path: tmpDir,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    feedbackService = new FeedbackService(db);
    memoryService = new MemoryService(db, sqlite);
    engine = new EvaluationEngine({ feedbackService, memoryService });
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('QualityEvaluator', () => {
    const evaluator = new QualityEvaluator();

    it('evaluates passing test execution as positive functional correctness', () => {
      const verifications: VerificationResult[] = [
        {
          stage: 'test',
          command: 'pnpm test users.test.ts',
          success: true,
          exitCode: 0,
          stdout: '3 passed',
          stderr: '',
          durationMs: 120,
        },
      ];

      const assessments = evaluator.evaluate({
        task: mockTask,
        verifications,
        filesModified: ['src/routes/users.ts'],
        gitDiff: '+ export function paginate() {}',
      });

      const funcCorr = assessments.find((a) => a.dimension === 'functional_correctness');
      expect(funcCorr?.result).toBe('positive');
      expect(funcCorr?.confidence).toBeGreaterThan(0.9);

      const secReview = assessments.find((a) => a.dimension === 'security_considerations');
      expect(secReview?.result).toBe('positive');
    });

    it('detects negative security review on hardcoded secret in diff', () => {
      const assessments = evaluator.evaluate({
        task: mockTask,
        verifications: [],
        filesModified: ['src/routes/users.ts'],
        gitDiff: '+ const api_key = "sk-1234567890abcdef1234567890";',
      });

      const secReview = assessments.find((a) => a.dimension === 'security_considerations');
      expect(secReview?.result).toBe('negative');
      expect(secReview?.supportingEvidence).toContain('credential');
    });

    it('marks functional correctness unverified if no tests were executed', () => {
      const assessments = evaluator.evaluate({
        task: mockTask,
        verifications: [],
        filesModified: ['src/routes/users.ts'],
      });

      const funcCorr = assessments.find((a) => a.dimension === 'functional_correctness');
      expect(funcCorr?.result).toBe('unverified');
    });
  });

  describe('FailureClassifier', () => {
    const classifier = new FailureClassifier();

    it('classifies test failures with explanation and excerpt', () => {
      const verifications: VerificationResult[] = [
        {
          stage: 'test',
          command: 'pnpm test users.test.ts',
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'AssertionError: expected 200 to be 404',
          durationMs: 90,
        },
      ];

      const failures = classifier.classify({
        task: mockTask,
        verifications,
        filesModified: ['src/routes/users.ts'],
      });

      expect(failures.length).toBeGreaterThanOrEqual(1);
      expect(failures.some((f) => f.category === 'test_failure')).toBe(true);
      expect(failures.some((f) => f.category === 'incorrect_implementation')).toBe(true);
    });

    it('classifies repository misunderstandings from tool errors', () => {
      const failures = classifier.classify({
        task: mockTask,
        verifications: [],
        toolCalls: [
          {
            toolName: 'read_file',
            arguments: { path: 'nonexistent/file.ts' },
            success: false,
            error: 'ENOENT: no such file or directory',
          },
        ],
        filesModified: [],
      });

      expect(failures.some((f) => f.category === 'repository_misunderstanding')).toBe(true);
      expect(failures.some((f) => f.category === 'missing_requirement')).toBe(true);
    });
  });

  describe('EvaluationEngine', () => {
    it('produces structured report and verifies passing tasks', () => {
      const verifications: VerificationResult[] = [
        {
          stage: 'test',
          command: 'pnpm test users.test.ts',
          success: true,
          exitCode: 0,
          stdout: '5 passed',
          stderr: '',
          durationMs: 200,
        },
        {
          stage: 'build',
          command: 'tsc -b',
          success: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 400,
        },
      ];

      const report = engine.evaluateTask({
        task: mockTask,
        sessionId: 'sess_eval_agent_1',
        projectId: 'proj_agent_test',
        verifications,
        filesModified: ['src/routes/users.ts'],
        gitDiff: '+ export function paginateUsers() {}',
      });

      expect(report.overallStatus).toBe('verified');
      expect(report.trainingEligible).toBe(true);
      expect(report.testStatus).toBe('passed');
      expect(report.buildStatus).toBe('passed');
      expect(report.markdownReport).toContain('EVOLVE TASK EVALUATION');
      expect(report.markdownReport).toContain('Overall status: Verified');

      // Verify that experience memory was persisted
      const experiences = memoryService.listExperiences('proj_agent_test');
      expect(experiences.length).toBe(1);
      expect(experiences[0]?.verificationStatus).toBe('verified');
    });

    it('marks tasks as verified_with_limitations when tests were skipped or not run', () => {
      const report = engine.evaluateTask({
        task: mockTask,
        sessionId: 'sess_eval_agent_2',
        projectId: 'proj_agent_test',
        verifications: [
          {
            stage: 'build',
            command: 'tsc -b',
            success: true,
            exitCode: 0,
            stdout: '',
            stderr: '',
            durationMs: 300,
          },
        ],
        filesModified: ['src/routes/users.ts'],
      });

      expect(report.overallStatus).toBe('verified_with_limitations');
      expect(report.trainingEligible).toBe(false);
    });

    it('marks tasks as failed on verification errors and saves failed attempt in memory', () => {
      const verifications: VerificationResult[] = [
        {
          stage: 'test',
          command: 'pnpm test',
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'TypeError: cannot read property of undefined',
          durationMs: 100,
        },
      ];

      const report = engine.evaluateTask({
        task: mockTask,
        sessionId: 'sess_eval_agent_3',
        projectId: 'proj_agent_test',
        verifications,
        filesModified: ['src/routes/users.ts'],
      });

      expect(report.overallStatus).toBe('failed');
      expect(report.failures.length).toBeGreaterThanOrEqual(1);

      // Verify that a failed_attempt memory was recorded
      const failedMemories = memoryService.listFailedAttempts('proj_agent_test');
      expect(failedMemories.length).toBe(1);
      expect(failedMemories[0]?.content).toContain('Avoid repeating this approach');
    });
  });
});
