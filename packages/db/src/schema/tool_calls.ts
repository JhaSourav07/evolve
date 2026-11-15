import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sessions } from './sessions.js';

export const toolCalls = sqliteTable(
  'tool_calls',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    toolName: text('tool_name').notNull(),
    arguments: text('arguments').notNull(), // JSON string
    output: text('output'),
    error: text('error'),
    status: text('status').notNull().default('pending'),
    createdAt: integer('created_at').notNull(),
    completedAt: integer('completed_at'),
  },
  (table) => [
    index('idx_tool_calls_session_id').on(table.sessionId),
    index('idx_tool_calls_status').on(table.status),
    index('idx_tool_calls_tool_name').on(table.toolName),
  ],
);

export type ToolCallRecord = typeof toolCalls.$inferSelect;
export type NewToolCallRecord = typeof toolCalls.$inferInsert;
