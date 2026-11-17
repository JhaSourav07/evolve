import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { plans } from './plans.js';
import { projects } from './projects.js';
import { sessions } from './sessions.js';

export const evaluations = sqliteTable(
  'evaluations',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    planId: text('plan_id').references(() => plans.id, {
      onDelete: 'set null',
    }),
    taskId: text('task_id'),
    taskTitle: text('task_title').notNull(),
    overallStatus: text('overall_status').notNull(), // 'verified' | 'verified_with_limitations' | 'unverified' | 'failed'
    requirementCoverage: text('requirement_coverage').notNull(), // 'complete' | 'partial' | 'missing' | 'untested'
    testStatus: text('test_status').notNull(), // 'passed' | 'failed' | 'skipped' | 'none'
    buildStatus: text('build_status').notNull(), // 'passed' | 'failed' | 'skipped' | 'none'
    typecheckStatus: text('typecheck_status').notNull(), // 'passed' | 'failed' | 'skipped' | 'none'
    lintStatus: text('lint_status').notNull(), // 'passed' | 'failed' | 'skipped' | 'none'
    gitDiffStatus: text('git_diff_status').notNull(), // 'reviewed' | 'unreviewed' | 'clean' | 'suspicious'
    qualityDimensionsJson: text('quality_dimensions_json').notNull(),
    failureClassificationsJson: text('failure_classifications_json'),
    evidenceSummaryJson: text('evidence_summary_json').notNull(),
    markdownReport: text('markdown_report').notNull(),
    userFeedbackStatus: text('user_feedback_status').notNull().default('pending'), // 'pending' | 'received' | 'skipped'
    trainingEligible: integer('training_eligible', { mode: 'boolean' }).notNull().default(false),
    trainingEligibilityReason: text('training_eligibility_reason'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_evaluations_project_id').on(table.projectId),
    index('idx_evaluations_session_id').on(table.sessionId),
    index('idx_evaluations_plan_id').on(table.planId),
    index('idx_evaluations_task_id').on(table.taskId),
    index('idx_evaluations_overall_status').on(table.overallStatus),
    index('idx_evaluations_training_eligible').on(table.trainingEligible),
  ],
);

export type EvaluationRecord = typeof evaluations.$inferSelect;
export type NewEvaluationRecord = typeof evaluations.$inferInsert;

