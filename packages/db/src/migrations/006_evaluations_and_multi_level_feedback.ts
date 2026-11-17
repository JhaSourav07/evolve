import type { Migration } from './runner.js';

export const migration006: Migration = {
  id: '006_evaluations_and_multi_level_feedback',
  up: `
    -- 1. Extend feedback table for multi-level feedback (response, action, task) and structured ratings
    ALTER TABLE feedback ADD COLUMN target_id TEXT;
    ALTER TABLE feedback ADD COLUMN feedback_level TEXT NOT NULL DEFAULT 'response';
    ALTER TABLE feedback ADD COLUMN rating_label TEXT;
    ALTER TABLE feedback ADD COLUMN action_rating TEXT;
    ALTER TABLE feedback ADD COLUMN task_ratings_json TEXT;
    ALTER TABLE feedback ADD COLUMN evaluation_id TEXT;
    ALTER TABLE feedback ADD COLUMN confidence REAL DEFAULT 1.0;
    ALTER TABLE feedback ADD COLUMN source TEXT NOT NULL DEFAULT 'user';
    ALTER TABLE feedback ADD COLUMN evidence_json TEXT;

    CREATE INDEX IF NOT EXISTS idx_feedback_level ON feedback(feedback_level);
    CREATE INDEX IF NOT EXISTS idx_feedback_target_id ON feedback(target_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_evaluation_id ON feedback(evaluation_id);

    -- 2. Create evaluations table for storing automated evaluation reports, evidence, and quality dimensions
    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
      task_id TEXT,
      task_title TEXT NOT NULL,
      overall_status TEXT NOT NULL,
      requirement_coverage TEXT NOT NULL,
      test_status TEXT NOT NULL,
      build_status TEXT NOT NULL,
      typecheck_status TEXT NOT NULL,
      lint_status TEXT NOT NULL,
      git_diff_status TEXT NOT NULL,
      quality_dimensions_json TEXT NOT NULL,
      failure_classifications_json TEXT,
      evidence_summary_json TEXT NOT NULL,
      markdown_report TEXT NOT NULL,
      user_feedback_status TEXT NOT NULL DEFAULT 'pending',
      training_eligible INTEGER NOT NULL DEFAULT 0,
      training_eligibility_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_evaluations_project_id ON evaluations(project_id);
    CREATE INDEX IF NOT EXISTS idx_evaluations_session_id ON evaluations(session_id);
    CREATE INDEX IF NOT EXISTS idx_evaluations_plan_id ON evaluations(plan_id);
    CREATE INDEX IF NOT EXISTS idx_evaluations_task_id ON evaluations(task_id);
    CREATE INDEX IF NOT EXISTS idx_evaluations_overall_status ON evaluations(overall_status);
    CREATE INDEX IF NOT EXISTS idx_evaluations_training_eligible ON evaluations(training_eligible);
  `,
};

