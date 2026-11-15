import type { Migration } from './runner.js';

export const migration002: Migration = {
  id: '002_feedback_and_memory',
  up: `
    -- 1. Add columns to feedback table for action-level feedback, written corrections, and technical verification
    ALTER TABLE feedback ADD COLUMN target_type TEXT NOT NULL DEFAULT 'response';
    ALTER TABLE feedback ADD COLUMN correction TEXT;
    ALTER TABLE feedback ADD COLUMN is_technically_correct INTEGER;
    ALTER TABLE feedback ADD COLUMN metadata TEXT;

    -- 2. Add tags column to knowledge table
    ALTER TABLE knowledge ADD COLUMN tags TEXT;

    -- 3. Create FTS5 virtual table for full-text keyword memory search
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      id UNINDEXED,
      project_id UNINDEXED,
      category,
      key,
      content,
      tags,
      tokenize = 'porter unicode61'
    );

    -- 4. Sync existing knowledge rows if any
    INSERT INTO memory_fts(id, project_id, category, key, content, tags)
    SELECT id, project_id, category, key, content, tags FROM knowledge;
  `,
};
