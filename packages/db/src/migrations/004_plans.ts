import type { Migration } from './runner.js';

export const migration004: Migration = {
  id: '004_plans',
  up: `
    -- 1. Plans table tracking structured software engineering implementation plans
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      objective TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'detailed',
      status TEXT NOT NULL DEFAULT 'awaiting_approval',
      revision INTEGER NOT NULL DEFAULT 1,
      superseded_by TEXT REFERENCES plans(id) ON DELETE SET NULL,
      requirements_json TEXT NOT NULL,
      assumptions_json TEXT NOT NULL DEFAULT '[]',
      risks_json TEXT NOT NULL,
      acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
      estimated_complexity TEXT NOT NULL DEFAULT 'medium',
      overall_risk TEXT NOT NULL DEFAULT 'medium',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_plans_project_id ON plans(project_id);
    CREATE INDEX IF NOT EXISTS idx_plans_session_id ON plans(session_id);
    CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
    CREATE INDEX IF NOT EXISTS idx_plans_created_at ON plans(created_at);

    -- 2. Tasks table storing decomposed tasks for each plan
    CREATE TABLE IF NOT EXISTS plan_tasks (
      id TEXT NOT NULL,
      plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      estimated_complexity TEXT NOT NULL DEFAULT 'medium',
      estimated_risk TEXT NOT NULL DEFAULT 'low',
      relevant_files_json TEXT NOT NULL DEFAULT '[]',
      expected_changes_json TEXT NOT NULL DEFAULT '[]',
      dependencies_json TEXT NOT NULL DEFAULT '[]',
      verification_steps_json TEXT NOT NULL DEFAULT '[]',
      potential_risks_json TEXT NOT NULL DEFAULT '[]',
      affected_components_json TEXT NOT NULL DEFAULT '[]',
      breaking_change INTEGER NOT NULL DEFAULT 0,
      security_implications TEXT,
      execution_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (plan_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_plan_tasks_plan_id ON plan_tasks(plan_id);
    CREATE INDEX IF NOT EXISTS idx_plan_tasks_status ON plan_tasks(status);

    -- 3. Plan Revisions table storing historical changes and rollback snapshots
    CREATE TABLE IF NOT EXISTS plan_revisions (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      change_summary TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_plan_revisions_plan_id ON plan_revisions(plan_id);
  `,
};

