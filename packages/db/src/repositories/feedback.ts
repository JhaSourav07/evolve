import { and, desc, eq } from 'drizzle-orm';
import type { EvolveDatabase } from '../connection.js';
import { feedback, type FeedbackRecord, type NewFeedbackRecord } from '../schema/index.js';

export class FeedbackRepository {
  constructor(private readonly db: EvolveDatabase) {}

  public record(data: NewFeedbackRecord): FeedbackRecord {
    const created = this.db.insert(feedback).values(data).returning().get();
    if (!created) {
      throw new Error('Failed to record feedback');
    }
    return created;
  }

  public findById(id: string): FeedbackRecord | undefined {
    return this.db.select().from(feedback).where(eq(feedback.id, id)).get();
  }

  public listAll(limit: number = 50): FeedbackRecord[] {
    return this.db.select().from(feedback).orderBy(desc(feedback.createdAt)).limit(limit).all();
  }

  public listBySession(sessionId: string): FeedbackRecord[] {
    return this.db
      .select()
      .from(feedback)
      .where(eq(feedback.sessionId, sessionId))
      .orderBy(desc(feedback.createdAt))
      .all();
  }

  public listByToolCall(toolCallId: string): FeedbackRecord[] {
    return this.db
      .select()
      .from(feedback)
      .where(eq(feedback.toolCallId, toolCallId))
      .orderBy(desc(feedback.createdAt))
      .all();
  }

  public listByTarget(targetId: string): FeedbackRecord[] {
    return this.db
      .select()
      .from(feedback)
      .where(eq(feedback.targetId, targetId))
      .orderBy(desc(feedback.createdAt))
      .all();
  }

  public listByLevel(feedbackLevel: string, sessionId?: string): FeedbackRecord[] {
    if (sessionId) {
      return this.db
        .select()
        .from(feedback)
        .where(and(eq(feedback.feedbackLevel, feedbackLevel), eq(feedback.sessionId, sessionId)))
        .orderBy(desc(feedback.createdAt))
        .all();
    }
    return this.db
      .select()
      .from(feedback)
      .where(eq(feedback.feedbackLevel, feedbackLevel))
      .orderBy(desc(feedback.createdAt))
      .all();
  }

  public listByEvaluation(evaluationId: string): FeedbackRecord[] {
    return this.db
      .select()
      .from(feedback)
      .where(eq(feedback.evaluationId, evaluationId))
      .orderBy(desc(feedback.createdAt))
      .all();
  }
}
