import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { projects } from './projects.js';

export const knowledge = sqliteTable(
  'knowledge',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    category: text('category').notNull(), // 'user_preference', 'project_rule', 'architecture_decision', 'experience', 'failed_attempt', etc.
    key: text('key').notNull(),
    content: text('content').notNull(),
    tags: text('tags'),
    confidence: real('confidence').notNull().default(1.0),
    sourceSessionId: text('source_session_id'),
    sourceEventId: text('source_event_id'),
    sourceType: text('source_type').notNull().default('explicit_user'),
    verificationStatus: text('verification_status').notNull().default('verified'),
    evidenceJson: text('evidence_json'),
    accessCount: integer('access_count').notNull().default(0),
    lastAccessedAt: integer('last_accessed_at').notNull().default(0),
    supersededBy: text('superseded_by'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_knowledge_project_id').on(table.projectId),
    index('idx_knowledge_category').on(table.category),
    index('idx_knowledge_key').on(table.key),
    index('idx_knowledge_verification_status').on(table.verificationStatus),
    index('idx_knowledge_source_session_id').on(table.sourceSessionId),
    index('idx_knowledge_superseded_by').on(table.supersededBy),
  ],
);

export type KnowledgeRecord = typeof knowledge.$inferSelect;
export type NewKnowledgeRecord = typeof knowledge.$inferInsert;
