import { desc, eq } from 'drizzle-orm';
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
}
