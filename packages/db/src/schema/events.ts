import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sessions } from './sessions.js';

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: text('payload').notNull(), // JSON string
    timestamp: integer('timestamp').notNull(),
  },
  (table) => [
    index('idx_events_session_id').on(table.sessionId),
    index('idx_events_type').on(table.type),
    index('idx_events_timestamp').on(table.timestamp),
  ],
);

export type EventRecord = typeof events.$inferSelect;
export type NewEventRecord = typeof events.$inferInsert;
