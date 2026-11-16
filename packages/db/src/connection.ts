import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from './migrations/runner.js';
import * as schema from './schema/index.js';

export type EvolveDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseConnectionOptions {
  path?: string;
  enableWal?: boolean;
  runMigrationsOnConnect?: boolean;
}

export interface EvolveDatabaseInstance {
  db: EvolveDatabase;
  sqlite: Database.Database;
  close: () => void;
}

/**
 * Initializes SQLite database connection with Drizzle ORM,
 * enforcing foreign keys, WAL mode, and running migrations.
 */
export function initDatabase(options: DatabaseConnectionOptions = {}): EvolveDatabaseInstance {
  const dbPath = options.path ?? ':memory:';
  const sqlite = new Database(dbPath);

  // Enforce foreign key constraints
  sqlite.pragma('foreign_keys = ON');

  // Enable Write-Ahead Logging for file-backed databases
  if (dbPath !== ':memory:' && (options.enableWal ?? true)) {
    sqlite.pragma('journal_mode = WAL');
  }

  // Auto-run migrations
  if (options.runMigrationsOnConnect ?? true) {
    runMigrations(sqlite);
  }

  const db = drizzle(sqlite, { schema });

  return {
    db,
    sqlite,
    close: () => {
      sqlite.close();
    },
  };
}

/**
 * Truncates all data from all application tables.
 * INTENDED STRICTLY FOR TESTING ENVIRONMENTS.
 */
export function resetTestDatabase(sqlite: Database.Database): void {
  const tables = [
    'repo_dependencies',
    'repo_symbols',
    'repo_files',
    'feedback',
    'tool_calls',
    'events',
    'training_examples',
    'knowledge',
    'sessions',
    'projects',
    'model_versions',
  ];

  const clearAll = sqlite.transaction(() => {
    sqlite.pragma('foreign_keys = OFF');
    for (const table of tables) {
      sqlite.exec(`DELETE FROM ${table};`);
    }
    try {
      sqlite.exec('DELETE FROM memory_fts;');
    } catch {
      // ignore if memory_fts does not exist yet
    }
    try {
      sqlite.exec('DELETE FROM repo_code_fts;');
    } catch {
      // ignore if repo_code_fts does not exist yet
    }
    sqlite.pragma('foreign_keys = ON');
  });

  clearAll();
}
