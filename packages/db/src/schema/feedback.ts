import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sessions } from './sessions.js';
import { toolCalls } from './tool_calls.js';

export const feedback = sqliteTable(
  'feedback',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    toolCallId: text('tool_call_id').references(() => toolCalls.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull(), // 'human', 'automated_test', 'compiler_check'
    rating: integer('rating'), // -1, 0, 1 or 1-5
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_feedback_session_id').on(table.sessionId),
    index('idx_feedback_tool_call_id').on(table.toolCallId),
    index('idx_feedback_type').on(table.type),
  ],
);

export type FeedbackRecord = typeof feedback.$inferSelect;
export type NewFeedbackRecord = typeof feedback.$inferInsert;
