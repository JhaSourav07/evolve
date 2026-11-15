import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { projects } from './projects.js';

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    goal: text('goal').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_sessions_project_id').on(table.projectId),
    index('idx_sessions_status').on(table.status),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
