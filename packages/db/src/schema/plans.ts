import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { projects } from './projects.js';
import { sessions } from './sessions.js';

export const plans = sqliteTable(
  'plans',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    objective: text('objective').notNull(),
    mode: text('mode').notNull().default('detailed'),
    status: text('status').notNull().default('awaiting_approval'),
    revision: integer('revision').notNull().default(1),
    supersededBy: text('superseded_by'),
    requirementsJson: text('requirements_json').notNull(),
    assumptionsJson: text('assumptions_json').notNull().default('[]'),
    risksJson: text('risks_json').notNull(),
    acceptanceCriteriaJson: text('acceptance_criteria_json').notNull().default('[]'),
    estimatedComplexity: text('estimated_complexity').notNull().default('medium'),
    overallRisk: text('overall_risk').notNull().default('medium'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_plans_project_id').on(table.projectId),
    index('idx_plans_session_id').on(table.sessionId),
    index('idx_plans_status').on(table.status),
    index('idx_plans_created_at').on(table.createdAt),
  ],
);

export const planTasks = sqliteTable(
  'plan_tasks',
  {
    id: text('id').notNull(),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    objective: text('objective').notNull(),
    status: text('status').notNull().default('pending'),
    estimatedComplexity: text('estimated_complexity').notNull().default('medium'),
    estimatedRisk: text('estimated_risk').notNull().default('low'),
    relevantFilesJson: text('relevant_files_json').notNull().default('[]'),
    expectedChangesJson: text('expected_changes_json').notNull().default('[]'),
    dependenciesJson: text('dependencies_json').notNull().default('[]'),
    verificationStepsJson: text('verification_steps_json').notNull().default('[]'),
    potentialRisksJson: text('potential_risks_json').notNull().default('[]'),
    affectedComponentsJson: text('affected_components_json').notNull().default('[]'),
    breakingChange: integer('breaking_change').notNull().default(0),
    securityImplications: text('security_implications'),
    executionOrder: integer('execution_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.planId, table.id] }),
    index('idx_plan_tasks_plan_id').on(table.planId),
    index('idx_plan_tasks_status').on(table.status),
  ],
);

export const planRevisions = sqliteTable(
  'plan_revisions',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    snapshotJson: text('snapshot_json').notNull(),
    changeSummary: text('change_summary').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_plan_revisions_plan_id').on(table.planId)],
);

export type PlanRow = typeof plans.$inferSelect;
export type NewPlanRow = typeof plans.$inferInsert;
export type PlanTaskRow = typeof planTasks.$inferSelect;
export type NewPlanTaskRow = typeof planTasks.$inferInsert;
export type PlanRevisionRow = typeof planRevisions.$inferSelect;
export type NewPlanRevisionRow = typeof planRevisions.$inferInsert;
