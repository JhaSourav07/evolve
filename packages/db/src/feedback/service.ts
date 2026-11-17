import { randomUUID } from 'node:crypto';
import type { EventBus, SessionId } from '@evolve/core';
import type { EvolveDatabase } from '../connection.js';
import { EvaluationRepository } from '../repositories/evaluation.js';
import { FeedbackRepository } from '../repositories/feedback.js';
import { SessionRepository } from '../repositories/session.js';
import { ToolCallRepository } from '../repositories/tool_call.js';
import { TrainingRepository } from '../repositories/training.js';
import type {
  EvaluationRecord,
  FeedbackRecord,
  NewEvaluationRecord,
  TrainingExampleRecord,
} from '../schema/index.js';
import type {
  ConvertToTrainingExampleOptions,
  EligibleTrainingItem,
  FeedbackRating,
  RecordActionFeedbackInput,
  RecordFeedbackInput,
  RecordResponseFeedbackInput,
  RecordTaskFeedbackInput,
  TaskEvaluationReport,
  TrainingDataFilter,
} from './types.js';

export function normalizeRating(rating: FeedbackRating): number {
  if (typeof rating === 'number') {
    return rating;
  }
  switch (rating) {
    case 'positive':
      return 1;
    case 'partial':
      return 0;
    case 'negative':
      return -1;
    default:
      return 0;
  }
}

function parseEvaluationRecord(r: EvaluationRecord): TaskEvaluationReport {
  return {
    id: r.id,
    projectId: r.projectId,
    sessionId: r.sessionId,
    planId: r.planId ?? undefined,
    taskId: r.taskId ?? undefined,
    taskTitle: r.taskTitle,
    overallStatus: r.overallStatus as TaskEvaluationReport['overallStatus'],
    requirementCoverage: r.requirementCoverage as TaskEvaluationReport['requirementCoverage'],
    testStatus: r.testStatus as TaskEvaluationReport['testStatus'],
    buildStatus: r.buildStatus as TaskEvaluationReport['buildStatus'],
    typecheckStatus: r.typecheckStatus as TaskEvaluationReport['typecheckStatus'],
    lintStatus: r.lintStatus as TaskEvaluationReport['lintStatus'],
    gitDiffStatus: r.gitDiffStatus as TaskEvaluationReport['gitDiffStatus'],
    dimensions: JSON.parse(r.qualityDimensionsJson || '[]'),
    failures: JSON.parse(r.failureClassificationsJson || '[]'),
    evidenceSummary: JSON.parse(r.evidenceSummaryJson || '{}'),
    markdownReport: r.markdownReport,
    userFeedbackStatus: r.userFeedbackStatus as TaskEvaluationReport['userFeedbackStatus'],
    trainingEligible: r.trainingEligible,
    trainingEligibilityReason: r.trainingEligibilityReason ?? undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export class FeedbackService {
  private readonly feedbackRepo: FeedbackRepository;
  private readonly sessionRepo: SessionRepository;
  private readonly toolCallRepo: ToolCallRepository;
  private readonly trainingRepo: TrainingRepository;
  private readonly evaluationRepo: EvaluationRepository;

  constructor(
    private readonly db: EvolveDatabase,
    private readonly eventBus?: EventBus | undefined,
  ) {
    this.feedbackRepo = new FeedbackRepository(db);
    this.sessionRepo = new SessionRepository(db);
    this.toolCallRepo = new ToolCallRepository(db);
    this.trainingRepo = new TrainingRepository(db);
    this.evaluationRepo = new EvaluationRepository(db);
  }

  /**
   * Records multi-level feedback (response, action, or task).
   */
  public record(input: RecordFeedbackInput): FeedbackRecord {
    if (!input.sessionId || input.sessionId.trim().length === 0) {
      throw new Error('Feedback must reference a valid sessionId');
    }

    const level = input.feedbackLevel ?? (input.targetType === 'action' ? 'action' : 'response');
    if (level === 'action' && (!input.toolCallId || input.toolCallId.trim().length === 0)) {
      throw new Error('Action-level feedback must reference a specific toolCallId');
    }

    const id = `fb_${randomUUID()}`;
    const numericRating = normalizeRating(input.rating);
    const createdAt = Date.now();

    const record = this.feedbackRepo.record({
      id,
      sessionId: input.sessionId,
      targetType: input.targetType,
      feedbackLevel: level,
      targetId: input.targetId ?? input.toolCallId ?? null,
      type: input.type ?? 'human',
      rating: numericRating,
      ratingLabel: input.ratingLabel ?? null,
      actionRating: input.actionRating ?? null,
      taskRatingsJson: input.taskRatings ? JSON.stringify(input.taskRatings) : null,
      evaluationId: input.evaluationId ?? null,
      confidence: input.confidence ?? 1.0,
      source: input.source ?? 'user',
      toolCallId: input.toolCallId ?? null,
      notes: input.notes ?? null,
      correction: input.correction ?? null,
      isTechnicallyCorrect: input.isTechnicallyCorrect ?? null,
      evidenceJson: input.evidence ? JSON.stringify(input.evidence) : null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt,
    });

    if (this.eventBus) {
      this.eventBus.emit('human_feedback', {
        id: `evt_${randomUUID()}`,
        sessionId: input.sessionId as SessionId,
        type: 'human_feedback',
        timestamp: createdAt,
        payload: {
          feedbackId: id,
          rating: numericRating,
          feedbackType: input.type ?? 'human',
          ...(input.notes ? { notes: input.notes } : {}),
          ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
        },
      });
    }

    return record;
  }

  /**
   * Records response-level feedback (correct, partially_correct, incorrect).
   */
  public recordResponseFeedback(input: RecordResponseFeedbackInput): FeedbackRecord {
    let numericRating: number;
    let ratingLabel: string;

    if (typeof input.rating === 'string') {
      ratingLabel = input.rating;
      numericRating = input.rating === 'correct' ? 1 : input.rating === 'partially_correct' ? 0 : -1;
    } else {
      numericRating = input.rating;
      ratingLabel = numericRating > 0 ? 'correct' : numericRating === 0 ? 'partially_correct' : 'incorrect';
    }

    return this.record({
      sessionId: input.sessionId,
      targetType: 'response',
      feedbackLevel: 'response',
      targetId: input.targetId,
      rating: numericRating,
      ratingLabel,
      notes: input.notes,
      correction: input.correction,
      isTechnicallyCorrect: input.isTechnicallyCorrect,
      metadata: input.metadata,
    });
  }

  /**
   * Records action-level feedback on a specific tool call.
   */
  public recordActionFeedback(input: RecordActionFeedbackInput): FeedbackRecord {
    const isPositiveAction =
      input.actionRating === 'correct_tool_selection' || input.actionRating === 'successful_action';
    const numericRating = input.rating !== undefined ? input.rating : isPositiveAction ? 1 : -1;

    const record = this.record({
      sessionId: input.sessionId,
      targetType: 'action',
      feedbackLevel: 'action',
      toolCallId: input.toolCallId,
      targetId: input.toolCallId,
      actionRating: input.actionRating,
      rating: numericRating,
      ratingLabel: input.actionRating,
      notes: input.notes,
      correction: input.correction,
      isTechnicallyCorrect: input.isTechnicallyCorrect,
      evidence: input.evidence,
      metadata: input.metadata,
    });

    if (this.eventBus) {
      this.eventBus.emit('action_feedback_received', {
        id: `evt_${randomUUID()}`,
        sessionId: input.sessionId as SessionId,
        type: 'action_feedback_received',
        timestamp: Date.now(),
        payload: {
          feedbackId: record.id,
          sessionId: input.sessionId,
          toolCallId: input.toolCallId,
          actionRating: input.actionRating,
          ...(input.notes ? { notes: input.notes } : {}),
        },
      });
    }

    return record;
  }

  /**
   * Records task-level multi-dimensional evaluation feedback.
   */
  public recordTaskFeedback(input: RecordTaskFeedbackInput): FeedbackRecord {
    const overall = input.ratings.overallRating;
    const numericRating = overall >= 4 ? 1 : overall >= 3 ? 0 : -1;
    const ratingLabel = overall >= 4 ? 'correct' : overall >= 3 ? 'partially_correct' : 'incorrect';

    const record = this.record({
      sessionId: input.sessionId,
      targetType: 'task',
      feedbackLevel: 'task',
      targetId: input.taskId,
      evaluationId: input.evaluationId,
      taskRatings: input.ratings,
      rating: numericRating,
      ratingLabel,
      notes: input.notes,
      correction: input.correction,
      isTechnicallyCorrect: input.isTechnicallyCorrect,
      metadata: input.metadata,
    });

    if (input.evaluationId) {
      this.evaluationRepo.updateUserFeedbackStatus(input.evaluationId, 'received');
    }

    if (this.eventBus) {
      this.eventBus.emit('task_feedback_received', {
        id: `evt_${randomUUID()}`,
        sessionId: input.sessionId as SessionId,
        type: 'task_feedback_received',
        timestamp: Date.now(),
        payload: {
          feedbackId: record.id,
          sessionId: input.sessionId,
          taskId: input.taskId,
          overallRating: overall,
          ...(input.notes ? { notes: input.notes } : {}),
        },
      });
    }

    return record;
  }

  /**
   * Persists an automated task evaluation report.
   */
  public recordEvaluation(evalReport: TaskEvaluationReport): EvaluationRecord {
    const now = Date.now();
    const data: NewEvaluationRecord = {
      id: evalReport.id,
      projectId: evalReport.projectId,
      sessionId: evalReport.sessionId,
      planId: evalReport.planId ?? null,
      taskId: evalReport.taskId ?? null,
      taskTitle: evalReport.taskTitle,
      overallStatus: evalReport.overallStatus,
      requirementCoverage: evalReport.requirementCoverage,
      testStatus: evalReport.testStatus,
      buildStatus: evalReport.buildStatus,
      typecheckStatus: evalReport.typecheckStatus,
      lintStatus: evalReport.lintStatus,
      gitDiffStatus: evalReport.gitDiffStatus,
      qualityDimensionsJson: JSON.stringify(evalReport.dimensions),
      failureClassificationsJson: JSON.stringify(evalReport.failures),
      evidenceSummaryJson: JSON.stringify(evalReport.evidenceSummary),
      markdownReport: evalReport.markdownReport,
      userFeedbackStatus: evalReport.userFeedbackStatus,
      trainingEligible: evalReport.trainingEligible,
      trainingEligibilityReason: evalReport.trainingEligibilityReason ?? null,
      createdAt: evalReport.createdAt || now,
      updatedAt: now,
    };

    const record = this.evaluationRepo.record(data);

    if (this.eventBus) {
      this.eventBus.emit('evaluation_created', {
        id: `evt_${randomUUID()}`,
        sessionId: evalReport.sessionId as SessionId,
        type: 'evaluation_created',
        timestamp: now,
        payload: {
          evaluationId: evalReport.id,
          projectId: evalReport.projectId,
          sessionId: evalReport.sessionId,
          overallStatus: evalReport.overallStatus,
          ...(evalReport.planId ? { planId: evalReport.planId } : {}),
          ...(evalReport.taskId ? { taskId: evalReport.taskId } : {}),
        },
      });

      this.eventBus.emit('evaluation_completed', {
        id: `evt_${randomUUID()}`,
        sessionId: evalReport.sessionId as SessionId,
        type: 'evaluation_completed',
        timestamp: now,
        payload: {
          evaluationId: evalReport.id,
          projectId: evalReport.projectId,
          sessionId: evalReport.sessionId,
          overallStatus: evalReport.overallStatus,
          trainingEligible: evalReport.trainingEligible,
        },
      });
    }

    return record;
  }

  public getEvaluation(id: string): TaskEvaluationReport | undefined {
    const record = this.evaluationRepo.findById(id);
    return record ? parseEvaluationRecord(record) : undefined;
  }

  public getEvaluationByTaskId(taskId: string): TaskEvaluationReport | undefined {
    const record = this.evaluationRepo.findByTaskId(taskId);
    return record ? parseEvaluationRecord(record) : undefined;
  }

  public listEvaluations(projectId: string, limit: number = 50): TaskEvaluationReport[] {
    return this.evaluationRepo.listByProject(projectId, limit).map(parseEvaluationRecord);
  }

  public listEvaluationsByStatus(
    status: string,
    projectId?: string,
  ): TaskEvaluationReport[] {
    return this.evaluationRepo.listByStatus(status, projectId).map(parseEvaluationRecord);
  }

  public findById(id: string): FeedbackRecord | undefined {
    return this.feedbackRepo.findById(id);
  }

  public listAll(limit: number = 50): FeedbackRecord[] {
    return this.feedbackRepo.listAll(limit);
  }

  public listBySession(sessionId: string): FeedbackRecord[] {
    return this.feedbackRepo.listBySession(sessionId);
  }

  public listByToolCall(toolCallId: string): FeedbackRecord[] {
    return this.feedbackRepo.listByToolCall(toolCallId);
  }

  public listByTarget(targetId: string): FeedbackRecord[] {
    return this.feedbackRepo.listByTarget(targetId);
  }

  public listByLevel(feedbackLevel: string, sessionId?: string): FeedbackRecord[] {
    return this.feedbackRepo.listByLevel(feedbackLevel, sessionId);
  }

  /**
   * Filters and retrieves candidate training items for SFT and DPO training data preparation.
   */
  public queryTrainingCandidates(filter?: TrainingDataFilter): EligibleTrainingItem[] {
    const evals = filter?.projectId
      ? this.evaluationRepo.listByProject(filter.projectId, filter?.limit ?? 100)
      : this.evaluationRepo.listAll(filter?.limit ?? 100);
    const items: EligibleTrainingItem[] = [];

    for (const ev of evals) {
      const parsed = parseEvaluationRecord(ev);
      const session = this.sessionRepo.findById(ev.sessionId);
      const prompt = session?.goal ?? ev.taskTitle;

      // Filter by verification status if requested
      if (filter?.verificationStatus && parsed.overallStatus !== filter.verificationStatus) {
        continue;
      }

      // Filter by failure categories if requested
      if (filter?.failureCategories && filter.failureCategories.length > 0) {
        const hasFailure = parsed.failures.some((f) =>
          filter.failureCategories!.includes(f.category),
        );
        if (!hasFailure) {
          continue;
        }
      }

      // Filter by quality dimension if requested
      if (filter?.qualityDimension) {
        const dim = parsed.dimensions.find((d) => d.dimension === filter.qualityDimension);
        if (!dim) {
          continue;
        }
      }

      // Check user feedback on this task if available
      const taskFeedback = this.feedbackRepo.listByTarget(ev.taskId ?? ev.id);
      const latestFeedback = taskFeedback[0];

      if (filter?.minRating !== undefined && latestFeedback) {
        if ((latestFeedback.rating ?? 0) < filter.minRating) {
          continue;
        }
      }

      const isVerified = parsed.overallStatus === 'verified';
      const isPositiveHuman = latestFeedback ? (latestFeedback.rating ?? 0) > 0 : false;
      const isNegativeHuman = latestFeedback ? (latestFeedback.rating ?? 0) < 0 : false;

      let pairType: EligibleTrainingItem['pairType'] = 'sft_demonstration';
      let isSuccessful = false;

      if (isVerified && (!latestFeedback || isPositiveHuman)) {
        pairType = 'sft_demonstration';
        isSuccessful = true;
      } else if (parsed.overallStatus === 'failed' || isNegativeHuman) {
        pairType = 'dpo_rejected';
        isSuccessful = false;
      } else if (isPositiveHuman) {
        pairType = 'dpo_chosen';
        isSuccessful = true;
      }

      items.push({
        evaluationId: ev.id,
        sessionId: ev.sessionId,
        prompt,
        response: parsed.markdownReport,
        critique:
          latestFeedback?.notes ??
          (isSuccessful
            ? 'Verified by automated tests and quality evaluations'
            : 'Unverified or failed implementation'),
        isSuccessful,
        pairType,
        metadata: {
          overallStatus: parsed.overallStatus,
          testStatus: parsed.testStatus,
          requirementCoverage: parsed.requirementCoverage,
          trainingEligible: parsed.trainingEligible,
          humanRating: latestFeedback?.rating ?? null,
          failures: parsed.failures.map((f) => f.category),
        },
        createdAt: ev.createdAt,
      });
    }

    return items;
  }

  /**
   * Transforms a feedback record and its referenced interaction into a fine-tuning training example.
   */
  public convertToTrainingExample(
    feedbackId: string,
    options?: ConvertToTrainingExampleOptions,
  ): TrainingExampleRecord {
    const fb = this.feedbackRepo.findById(feedbackId);
    if (!fb) {
      throw new Error(`Feedback not found: ${feedbackId}`);
    }

    const session = this.sessionRepo.findById(fb.sessionId);
    const prompt = options?.prompt ?? session?.goal ?? 'Unknown task prompt';

    let response = options?.response;
    if (!response) {
      if (fb.correction && fb.correction.trim().length > 0) {
        response = fb.correction;
      } else if (fb.toolCallId) {
        const tc = this.toolCallRepo.findById(fb.toolCallId);
        response = tc
          ? `[Tool: ${tc.toolName}] Arguments: ${tc.arguments}\nOutput: ${tc.output ?? ''}`
          : 'Unknown tool action';
      } else {
        response = 'Solution evaluated by feedback';
      }
    }

    const isPositive = fb.rating !== null && fb.rating > 0;
    const isTechnicallyVerified = fb.isTechnicallyCorrect === true;
    const isSuccessful = isPositive && isTechnicallyVerified ? 1 : 0;

    const critique =
      options?.critique ??
      fb.notes ??
      (isSuccessful
        ? 'Verified technically correct and approved by human feedback'
        : 'Solution unverified or rejected by human feedback');

    const metadataObj = {
      feedbackId: fb.id,
      targetType: fb.targetType,
      feedbackLevel: fb.feedbackLevel,
      rating: fb.rating,
      ratingLabel: fb.ratingLabel,
      actionRating: fb.actionRating,
      isTechnicallyCorrect: fb.isTechnicallyCorrect,
      hasWrittenCorrection: Boolean(fb.correction),
      ...(options?.metadata ?? {}),
    };

    return this.trainingRepo.record({
      id: `train_${randomUUID()}`,
      sessionId: fb.sessionId,
      prompt,
      response,
      critique,
      isSuccessful,
      metadata: JSON.stringify(metadataObj),
      createdAt: Date.now(),
    });
  }
}
