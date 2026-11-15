import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sessions } from './sessions.js';

export const trainingExamples = sqliteTable(
  'training_examples',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').references(() => sessions.id, {
      onDelete: 'set null',
    }),
    prompt: text('prompt').notNull(),
    response: text('response').notNull(),
    critique: text('critique'),
    isSuccessful: integer('is_successful').notNull().default(1),
    metadata: text('metadata'), // JSON string
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_training_examples_session_id').on(table.sessionId),
    index('idx_training_examples_is_successful').on(table.isSuccessful),
  ],
);

export type TrainingExampleRecord = typeof trainingExamples.$inferSelect;
export type NewTrainingExampleRecord = typeof trainingExamples.$inferInsert;
