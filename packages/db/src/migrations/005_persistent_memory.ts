import type { Migration } from './runner.js';

export const migration005: Migration = {
  id: '005_persistent_memory',
  up: `
    -- 1. Add provenance, verification status, evidence, access tracking, and conflict superseding columns
    ALTER TABLE knowledge ADD COLUMN source_session_id TEXT;
    ALTER TABLE knowledge ADD COLUMN source_event_id TEXT;
    ALTER TABLE knowledge ADD COLUMN source_type TEXT NOT NULL DEFAULT 'explicit_user';
    ALTER TABLE knowledge ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'verified';
    ALTER TABLE knowledge ADD COLUMN evidence_json TEXT;
    ALTER TABLE knowledge ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE knowledge ADD COLUMN last_accessed_at INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE knowledge ADD COLUMN superseded_by TEXT;

    -- 2. Indexes for efficient status filtering, provenance tracing, and conflict resolution
    CREATE INDEX IF NOT EXISTS idx_knowledge_verification_status ON knowledge(verification_status);
    CREATE INDEX IF NOT EXISTS idx_knowledge_source_session_id ON knowledge(source_session_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_superseded_by ON knowledge(superseded_by);
  `,
};

