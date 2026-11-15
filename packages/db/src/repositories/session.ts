import { desc, eq } from 'drizzle-orm';
import type { EvolveDatabase } from '../connection.js';
import {
  events,
  sessions,
  type NewEventRecord,
  type NewSession,
  type Session,
} from '../schema/index.js';

export class SessionRepository {
  constructor(private readonly db: EvolveDatabase) {}

  public create(data: NewSession): Session {
    const created = this.db.insert(sessions).values(data).returning().get();
    if (!created) {
      throw new Error('Failed to create session');
    }
    return created;
  }

  /**
   * Atomic multi-step transaction: creates a new session AND logs the
   * initial session:started event in one single commit.
   */
  public createWithInitialEvent(
    sessionData: NewSession,
    eventData: Omit<NewEventRecord, 'sessionId'>,
  ): Session {
    return this.db.transaction((tx) => {
      const newSession = tx.insert(sessions).values(sessionData).returning().get();
      if (!newSession) {
        throw new Error('Failed to create session in transaction');
      }

      tx.insert(events)
        .values({
          ...eventData,
          sessionId: newSession.id,
        })
        .run();

      return newSession;
    });
  }

  public findById(id: string): Session | undefined {
    return this.db.select().from(sessions).where(eq(sessions.id, id)).get();
  }

  public listByProject(projectId: string): Session[] {
    return this.db
      .select()
      .from(sessions)
      .where(eq(sessions.projectId, projectId))
      .orderBy(desc(sessions.createdAt))
      .all();
  }

  public updateStatus(id: string, status: string): Session | undefined {
    return this.db
      .update(sessions)
      .set({ status, updatedAt: Date.now() })
      .where(eq(sessions.id, id))
      .returning()
      .get();
  }
}
