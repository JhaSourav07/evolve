import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import {
  InMemoryEventBus,
  validateEventPayload,
  type CoreEventType,
  type EventEnvelope,
  type EventFilterOptions,
  type EventInputPayloadMap,
  type EventListener,
  type EventPayloadMap,
  type SessionId,
  type Unsubscribe,
} from '@evolve/core';
import type { EvolveDatabase } from '../connection.js';
import { EventRepository } from '../repositories/event.js';
import { events } from '../schema/events.js';

export class EventService {
  private readonly bus = new InMemoryEventBus();
  private readonly repo: EventRepository;

  constructor(private readonly db: EvolveDatabase) {
    this.repo = new EventRepository(db);
  }

  /**
   * Validates payload, stores event to SQLite, and emits to in-memory subscribers.
   */
  public publish<T extends CoreEventType>(
    sessionId: SessionId | string,
    type: T,
    payload: EventInputPayloadMap[T],
  ): EventEnvelope<T> {
    // 1. Validate payload with Zod schema (throws ValidationError if invalid)
    const validatedPayload = validateEventPayload(type, payload);

    const id = `evt_${randomUUID()}`;
    const timestamp = Date.now();

    // 2. Persist to SQLite
    this.repo.record({
      id,
      sessionId,
      type,
      payload: JSON.stringify(validatedPayload),
      timestamp,
    });

    const envelope: EventEnvelope<T> = {
      id,
      sessionId: sessionId as SessionId,
      type,
      timestamp,
      payload: validatedPayload,
    };

    // 3. Dispatch to in-memory listeners
    this.bus.emit(type, envelope);

    return envelope;
  }

  /**
   * Subscribes to all events (wildcard observer).
   */
  public subscribe(listener: EventListener<EventEnvelope>): Unsubscribe {
    return this.bus.onAny(listener);
  }

  /**
   * Subscribes to a specific event type.
   */
  public subscribeTo<T extends CoreEventType>(
    type: T,
    listener: EventListener<EventEnvelope<T>>,
  ): Unsubscribe {
    return this.bus.on(type, listener);
  }

  /**
   * Retrieves all events for a session in strict chronological order.
   */
  public getSessionEvents(sessionId: SessionId | string): EventEnvelope[] {
    const rows = this.repo.listBySession(sessionId);
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId as SessionId,
      type: row.type as CoreEventType,
      timestamp: row.timestamp,
      payload: JSON.parse(row.payload) as EventPayloadMap[CoreEventType],
    }));
  }

  /**
   * Queries events with flexible filtering options (types, sessionId, time range, limit).
   */
  public filter(options: EventFilterOptions = {}): EventEnvelope[] {
    const conditions = [];

    if (options.sessionId) {
      conditions.push(eq(events.sessionId, options.sessionId));
    }
    if (options.types && options.types.length > 0) {
      conditions.push(inArray(events.type, options.types as string[]));
    }
    if (options.since !== undefined) {
      conditions.push(gte(events.timestamp, options.since));
    }
    if (options.until !== undefined) {
      conditions.push(lte(events.timestamp, options.until));
    }

    let query = this.db
      .select()
      .from(events)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(events.timestamp));

    if (options.limit && options.limit > 0) {
      query = query.limit(options.limit) as typeof query;
    }

    const rows = query.all();

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId as SessionId,
      type: row.type as CoreEventType,
      timestamp: row.timestamp,
      payload: JSON.parse(row.payload) as EventPayloadMap[CoreEventType],
    }));
  }
}
