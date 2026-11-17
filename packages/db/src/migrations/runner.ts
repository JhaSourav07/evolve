import type Database from 'better-sqlite3';
import { migration001 } from './001_initial.js';
import { migration002 } from './002_feedback_and_memory.js';
import { migration003 } from './003_repo_index.js';
import { migration004 } from './004_plans.js';
import { migration005 } from './005_persistent_memory.js';

export interface Migration {
  id: string;
  up: string;
}

export const ALL_MIGRATIONS: readonly Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
];

/**
 * Runs all pending migrations sequentially inside an atomic transaction.
 * Returns the IDs of the migrations applied during this execution.
 */
export function runMigrations(sqlite: Database.Database): string[] {
  // Ensure the migration tracking table exists
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = sqlite.prepare('SELECT id FROM schema_migrations').all() as {
    id: string;
  }[];
  const appliedSet = new Set(appliedRows.map((row) => row.id));

  const appliedNow: string[] = [];

  const runAll = sqlite.transaction(() => {
    const insertStmt = sqlite.prepare(
      'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
    );

    for (const migration of ALL_MIGRATIONS) {
      if (!appliedSet.has(migration.id)) {
        sqlite.exec(migration.up);
        insertStmt.run(migration.id, Date.now());
        appliedNow.push(migration.id);
      }
    }
  });

  runAll();

  return appliedNow;
}
