import { desc, eq } from 'drizzle-orm';
import type { EvolveDatabase } from '../connection.js';
import {
  feedback,
  toolCalls,
  type NewFeedbackRecord,
  type NewToolCallRecord,
  type ToolCallRecord,
} from '../schema/index.js';

export class ToolCallRepository {
  constructor(private readonly db: EvolveDatabase) {}

  public recordCall(data: NewToolCallRecord): ToolCallRecord {
    const created = this.db.insert(toolCalls).values(data).returning().get();
    if (!created) {
      throw new Error('Failed to record tool call');
    }
    return created;
  }

  public completeCall(
    id: string,
    result: { output?: string; error?: string; status: 'success' | 'failed' },
  ): ToolCallRecord | undefined {
    return this.db
      .update(toolCalls)
      .set({
        output: result.output,
        error: result.error,
        status: result.status,
        completedAt: Date.now(),
      })
      .where(eq(toolCalls.id, id))
      .returning()
      .get();
  }

  /**
   * Atomic multi-step transaction: updates tool call completion status
   * and records action-level feedback simultaneously.
   */
  public completeWithFeedback(
    id: string,
    result: { output?: string; error?: string; status: 'success' | 'failed' },
    feedbackData: Omit<NewFeedbackRecord, 'toolCallId'>,
  ): ToolCallRecord {
    return this.db.transaction((tx) => {
      const updated = tx
        .update(toolCalls)
        .set({
          output: result.output,
          error: result.error,
          status: result.status,
          completedAt: Date.now(),
        })
        .where(eq(toolCalls.id, id))
        .returning()
        .get();

      if (!updated) {
        throw new Error(`Tool call ${id} not found`);
      }

      tx.insert(feedback)
        .values({
          ...feedbackData,
          toolCallId: id,
        })
        .run();

      return updated;
    });
  }

  public listBySession(sessionId: string): ToolCallRecord[] {
    return this.db
      .select()
      .from(toolCalls)
      .where(eq(toolCalls.sessionId, sessionId))
      .orderBy(desc(toolCalls.createdAt))
      .all();
  }
}
