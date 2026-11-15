import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { runMigrations } from './migrations/runner.js';

describe('Migration System', () => {
  it('runs initial migrations and is idempotent on subsequent runs', () => {
    const sqlite = new Database(':memory:');

    // First run: should apply migration 001
    const firstRun = runMigrations(sqlite);
    expect(firstRun).toContain('001_initial_schema');

    // Verify tables exist
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('schema_migrations');
    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('events');
    expect(tableNames).toContain('tool_calls');
    expect(tableNames).toContain('feedback');
    expect(tableNames).toContain('knowledge');
    expect(tableNames).toContain('training_examples');
    expect(tableNames).toContain('model_versions');

    // Second run: should be idempotent (apply 0 migrations)
    const secondRun = runMigrations(sqlite);
    expect(secondRun).toHaveLength(0);

    sqlite.close();
  });
});
