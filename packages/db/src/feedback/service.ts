import { randomUUID } from 'node:crypto';
import type { EventBus, SessionId } from '@evolve/core';
import type { EvolveDatabase } from '../connection.js';
import { FeedbackRepository } from '../repositories/feedback.js';
import { SessionRepository } from '../repositories/session.js';
import { ToolCallRepository } from '../repositories/tool_call.js';
import { TrainingRepository } from '../repositories/training.js';
import type { FeedbackRecord, TrainingExampleRecord } from '../schema/index.js';
import type {
  ConvertToTrainingExampleOptions,
  FeedbackRating,
  RecordFeedbackInput,
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

export class FeedbackService {
  private readonly feedbackRepo: FeedbackRepository;
  private readonly sessionRepo: SessionRepository;
  private readonly toolCallRepo: ToolCallRepository;
  private readonly trainingRepo: TrainingRepository;

  constructor(
    private readonly db: EvolveDatabase,
    private readonly eventBus?: EventBus | undefined,
  ) {
    this.feedbackRepo = new FeedbackRepository(db);
    this.sessionRepo = new SessionRepository(db);
    this.toolCallRepo = new ToolCallRepository(db);
    this.trainingRepo = new TrainingRepository(db);
  }

  /**
   * Records human feedback referencing an action or response.
   */
  public record(input: RecordFeedbackInput): FeedbackRecord {
    if (!input.sessionId || input.sessionId.trim().length === 0) {
      throw new Error('Feedback must reference a valid sessionId');
    }

    if (
      input.targetType === 'action' &&
      (!input.toolCallId || input.toolCallId.trim().length === 0)
    ) {
      throw new Error('Action-level feedback must reference a specific toolCallId');
    }

    const id = `fb_${randomUUID()}`;
    const numericRating = normalizeRating(input.rating);
    const createdAt = Date.now();

    const record = this.feedbackRepo.record({
      id,
      sessionId: input.sessionId,
      targetType: input.targetType,
      type: input.type ?? 'human',
      rating: numericRating,
      toolCallId: input.toolCallId,
      notes: input.notes,
      correction: input.correction,
      isTechnicallyCorrect: input.isTechnicallyCorrect,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt,
    });

    // Publish human_feedback event if bus is provided
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

  public findById(id: string): FeedbackRecord | undefined {
    return this.feedbackRepo.findById(id);
  }

  public listBySession(sessionId: string): FeedbackRecord[] {
    return this.feedbackRepo.listBySession(sessionId);
  }

  public listByToolCall(toolCallId: string): FeedbackRecord[] {
    return this.feedbackRepo.listByToolCall(toolCallId);
  }

  /**
   * Transforms a feedback record and its referenced interaction into a fine-tuning training example.
   *
   * Crucial Principle: A positive rating does NOT automatically imply technical correctness!
   * An example is marked isSuccessful = 1 only if rating > 0 AND isTechnicallyCorrect === true.
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

    // A positive rating must NOT automatically imply technical correctness!
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
      rating: fb.rating,
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
