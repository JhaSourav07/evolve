import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
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
    targetId: text('target_id'), // eventId, toolCallId, taskId, or planId
    feedbackLevel: text('feedback_level').notNull().default('response'), // 'response' | 'action' | 'task'
    targetType: text('target_type').notNull().default('response'), // backward-compatibility alias
    type: text('type').notNull().default('human'), // 'human', 'automated_test', 'compiler_check'
    rating: integer('rating'), // -1, 0, 1 (numeric rating)
    ratingLabel: text('rating_label'), // 'correct' | 'partially_correct' | 'incorrect'
    actionRating: text('action_rating'), // 'correct_tool_selection' | 'incorrect_tool_selection' | etc.
    taskRatingsJson: text('task_ratings_json'), // JSON of TaskRatings
    evaluationId: text('evaluation_id'), // Linked evaluation report ID
    confidence: real('confidence').default(1.0),
    source: text('source').notNull().default('user'), // 'user' | 'automated_evaluation' | 'hybrid'
    notes: text('notes'),
    correction: text('correction'), // Written user correction
    isTechnicallyCorrect: integer('is_technically_correct', { mode: 'boolean' }),
    evidenceJson: text('evidence_json'),
    metadata: text('metadata'), // JSON string
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_feedback_session_id').on(table.sessionId),
    index('idx_feedback_tool_call_id').on(table.toolCallId),
    index('idx_feedback_type').on(table.type),
    index('idx_feedback_target_type').on(table.targetType),
    index('idx_feedback_level').on(table.feedbackLevel),
    index('idx_feedback_target_id').on(table.targetId),
    index('idx_feedback_evaluation_id').on(table.evaluationId),
  ],
);

export type FeedbackRecord = typeof feedback.$inferSelect;
export type NewFeedbackRecord = typeof feedback.$inferInsert;
