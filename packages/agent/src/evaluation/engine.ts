import { randomUUID } from 'node:crypto';
import type {
  EvaluationOverallStatus,
  FailureClassification,
  Plan,
  PlanTask,
  QualityDimensionAssessment,
  TaskEvaluationReport,
  VerificationResult,
} from '@evolve/core';
import type { FeedbackService, MemoryService } from '@evolve/db';
import { scrubSecrets } from '../tools/security.js';
import { FailureClassifier } from './failure-classifier.js';
import { QualityEvaluator } from './quality-evaluator.js';

export interface EvaluateTaskExecutionOptions {
  plan?: Plan | undefined;
  task: PlanTask;
  sessionId: string;
  projectId: string;
  verifications: VerificationResult[];
  filesModified: string[];
  gitDiff?: string | undefined;
  toolCalls?: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    output?: string | undefined;
    error?: string | undefined;
    success?: boolean | undefined;
  }> | undefined;
  runtimeError?: string | undefined;
}

export interface EvaluationEngineOptions {
  feedbackService?: FeedbackService | undefined;
  memoryService?: MemoryService | undefined;
}

export class EvaluationEngine {
  private readonly qualityEvaluator: QualityEvaluator;
  private readonly failureClassifier: FailureClassifier;
  private readonly feedbackService?: FeedbackService | undefined;
  private readonly memoryService?: MemoryService | undefined;

  constructor(options: EvaluationEngineOptions = {}) {
    this.qualityEvaluator = new QualityEvaluator();
    this.failureClassifier = new FailureClassifier();
    this.feedbackService = options.feedbackService;
    this.memoryService = options.memoryService;
  }

  /**
   * Evaluates a completed or failed task execution using multi-dimensional evidence,
   * produces a structured report, and connects insights into persistent memory.
   */
  public evaluateTask(options: EvaluateTaskExecutionOptions): TaskEvaluationReport {
    const {
      task,
      sessionId,
      projectId,
      plan,
      verifications,
      filesModified,
      gitDiff,
      toolCalls,
      runtimeError,
    } = options;

    const id = `eval_${randomUUID()}`;

    // 1. Run Quality Dimensions Assessment
    const dimensions = this.qualityEvaluator.evaluate({
      task,
      verifications,
      filesModified,
      gitDiff,
      toolCalls,
      runtimeError,
    });

    // 2. Run Failure Classification
    const failures = this.failureClassifier.classify({
      task,
      verifications,
      runtimeError,
      toolCalls,
      filesModified,
    });

    // 3. Determine Verification Statuses for Each Pipeline Stage
    const testStatus = this.resolveStageStatus(verifications, 'test');
    const buildStatus = this.resolveStageStatus(verifications, 'build');
    const typecheckStatus = this.resolveStageStatus(verifications, 'typecheck');
    const lintStatus = this.resolveStageStatus(verifications, 'lint');
    const gitDiffStatus: TaskEvaluationReport['gitDiffStatus'] =
      gitDiff && gitDiff.length > 0
        ? 'reviewed'
        : filesModified.length > 0
          ? 'unreviewed'
          : 'clean';

    // 4. Requirement Coverage
    const reqAssessment = dimensions.find((d) => d.dimension === 'requirement_coverage');
    let requirementCoverage: TaskEvaluationReport['requirementCoverage'] = 'complete';
    if (reqAssessment?.result === 'negative') {
      requirementCoverage = 'missing';
    } else if (reqAssessment?.result === 'partial') {
      requirementCoverage = 'partial';
    } else if (reqAssessment?.result === 'unverified') {
      requirementCoverage = 'untested';
    }

    // 5. Determine Overall Evaluation Status
    const overallStatus = this.computeOverallStatus({
      testStatus,
      buildStatus,
      typecheckStatus,
      lintStatus,
      requirementCoverage,
      failures,
      runtimeError,
    });

    // 6. Determine Training Data Eligibility
    const isTrainingEligible =
      overallStatus === 'verified' &&
      testStatus === 'passed' &&
      failures.length === 0 &&
      requirementCoverage === 'complete';

    const trainingEligibilityReason = isTrainingEligible
      ? 'Task verified with passing tests, full requirement coverage, and clean build.'
      : overallStatus === 'failed'
        ? 'Task failed verification; eligible for negative contrast (DPO rejected candidate).'
        : 'Task has unverified criteria or limitations; ineligible for training demonstration.';

    // 7. Format Markdown Report
    const markdownReport = this.generateMarkdownReport({
      taskTitle: task.title,
      requirementCoverage,
      testStatus,
      buildStatus,
      typecheckStatus,
      lintStatus,
      gitDiffStatus,
      overallStatus,
      dimensions,
      failures,
    });

    const report: TaskEvaluationReport = {
      id,
      projectId,
      sessionId,
      planId: plan?.planId,
      taskId: task.id,
      taskTitle: task.title,
      overallStatus,
      requirementCoverage,
      testStatus,
      buildStatus,
      typecheckStatus,
      lintStatus,
      gitDiffStatus,
      dimensions,
      failures,
      evidenceSummary: {
        totalVerifications: verifications.length,
        filesModified,
        runtimeError: runtimeError ?? null,
      },
      markdownReport: scrubSecrets(markdownReport),
      userFeedbackStatus: 'pending',
      trainingEligible: isTrainingEligible,
      trainingEligibilityReason,
      createdAt: Date.now(),
    };

    // 8. Persist Evaluation in Database
    if (this.feedbackService) {
      try {
        this.feedbackService.recordEvaluation(report);
      } catch {
        // non-blocking persistence
      }
    }

    // 9. Send Verified Insights to Phase 4 Persistent Memory
    if (this.memoryService) {
      try {
        this.connectToMemory(report, task, plan);
      } catch {
        // non-blocking memory update
      }
    }

    return report;
  }

  private resolveStageStatus(
    verifications: VerificationResult[],
    stage: string,
  ): 'passed' | 'failed' | 'skipped' | 'none' {
    const matched = verifications.filter((v) => v.stage === stage || v.command.includes(stage));
    if (matched.length === 0) {
      return 'none';
    }
    const anyFailed = matched.some((v) => !v.success || v.exitCode !== 0);
    return anyFailed ? 'failed' : 'passed';
  }

  private computeOverallStatus(params: {
    testStatus: string;
    buildStatus: string;
    typecheckStatus: string;
    lintStatus: string;
    requirementCoverage: string;
    failures: FailureClassification[];
    runtimeError?: string | undefined;
  }): EvaluationOverallStatus {
    if (
      params.runtimeError ||
      params.testStatus === 'failed' ||
      params.buildStatus === 'failed' ||
      params.typecheckStatus === 'failed' ||
      params.failures.length > 0
    ) {
      return 'failed';
    }

    if (params.testStatus === 'none' && params.buildStatus === 'none') {
      return 'unverified';
    }

    if (params.requirementCoverage !== 'complete' || params.testStatus === 'none') {
      return 'verified_with_limitations';
    }

    return 'verified';
  }

  private generateMarkdownReport(data: {
    taskTitle: string;
    requirementCoverage: string;
    testStatus: string;
    buildStatus: string;
    typecheckStatus: string;
    lintStatus: string;
    gitDiffStatus: string;
    overallStatus: EvaluationOverallStatus;
    dimensions: QualityDimensionAssessment[];
    failures: FailureClassification[];
  }): string {
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

    const lines: string[] = [
      'EVOLVE TASK EVALUATION',
      '',
      `Task: ${data.taskTitle}`,
      '',
      `Requirement coverage: ${capitalize(data.requirementCoverage)}`,
      `Tests: ${capitalize(data.testStatus)}`,
      `Build: ${capitalize(data.buildStatus)}`,
      `TypeScript: ${capitalize(data.typecheckStatus)}`,
      `Lint: ${capitalize(data.lintStatus)}`,
      `Git diff: ${capitalize(data.gitDiffStatus)}`,
      '',
      'Automated assessment:',
    ];

    for (const dim of data.dimensions) {
      lines.push(`${capitalize(dim.dimension)}: ${capitalize(dim.result)}`);
    }

    if (data.failures.length > 0) {
      lines.push('', 'Failures detected:');
      for (const f of data.failures) {
        lines.push(`- [${capitalize(f.category)}] ${f.explanation}`);
      }
    }

    lines.push('', 'User feedback: Pending', '', `Overall status: ${capitalize(data.overallStatus)}`);

    return lines.join('\n');
  }

  /**
   * Connects verified findings directly into Phase 4 persistent experience memory.
   */
  private connectToMemory(
    report: TaskEvaluationReport,
    task: PlanTask,
    plan?: Plan | undefined,
  ): void {
    if (!this.memoryService) return;

    const sanitizedTitle = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 35);

    if (report.overallStatus === 'verified') {
      this.memoryService.saveExperience(
        `exp.${sanitizedTitle}`,
        `Task "${task.title}" verified successfully. All tests and build checks passed.`,
        {
          projectId: report.projectId,
          confidence: 0.95,
          sourceType: 'verified_execution',
          verificationStatus: 'verified',
          tags: ['evaluation', 'verified_solution', ...(task.relevantFiles || [])],
          evidence: {
            evaluationId: report.id,
            planId: plan?.planId,
            taskId: task.id,
            verifications: report.evidenceSummary,
          },
        },
      );
    } else if (report.overallStatus === 'failed') {
      const topFailure = report.failures[0]?.explanation || 'Verification failed';
      this.memoryService.saveFailedAttempt(
        report.projectId,
        `failed.${sanitizedTitle}`,
        `Failed attempt on "${task.title}": ${topFailure}. Avoid repeating this approach.`,
        {
          confidence: 0.9,
          sourceType: 'failed_execution',
          verificationStatus: 'verified',
          tags: ['evaluation', 'failed_attempt', 'postmortem'],
          evidence: {
            evaluationId: report.id,
            failures: report.failures,
          },
        },
      );
    }
  }
}
