import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { projects } from './projects.js';

export const knowledge = sqliteTable(
  'knowledge',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    category: text('category').notNull(), // 'user_preference', 'project_rule', 'api_convention', 'experience', 'reflexion'
    key: text('key').notNull(),
    content: text('content').notNull(),
    tags: text('tags'),
    confidence: real('confidence').notNull().default(1.0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_knowledge_project_id').on(table.projectId),
    index('idx_knowledge_category').on(table.category),
    index('idx_knowledge_key').on(table.key),
  ],
);

export type KnowledgeRecord = typeof knowledge.$inferSelect;
export type NewKnowledgeRecord = typeof knowledge.$inferInsert;
