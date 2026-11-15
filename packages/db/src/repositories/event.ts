import { asc, eq } from 'drizzle-orm';
import type { EvolveDatabase } from '../connection.js';
import { events, type EventRecord, type NewEventRecord } from '../schema/index.js';

export class EventRepository {
  constructor(private readonly db: EvolveDatabase) {}

  public record(data: NewEventRecord): EventRecord {
    const created = this.db.insert(events).values(data).returning().get();
    if (!created) {
      throw new Error('Failed to record event');
    }
    return created;
  }

  public listBySession(sessionId: string): EventRecord[] {
    return this.db
      .select()
      .from(events)
      .where(eq(events.sessionId, sessionId))
      .orderBy(asc(events.timestamp))
      .all();
  }
}
