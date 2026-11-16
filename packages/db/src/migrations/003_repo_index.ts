import type { Migration } from './runner.js';

export const migration003: Migration = {
  id: '003_repo_index',
  up: `
    -- 1. Track indexed repository files with hash and mtime for incremental indexing
    CREATE TABLE IF NOT EXISTS repo_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      language TEXT NOT NULL,
      is_test INTEGER NOT NULL DEFAULT 0,
      indexed_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_repo_files_project_path ON repo_files(project_id, path);
    CREATE INDEX IF NOT EXISTS idx_repo_files_hash ON repo_files(content_hash);

    -- 2. Track extracted code symbols (functions, classes, interfaces, types, methods)
    CREATE TABLE IF NOT EXISTS repo_symbols (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      file_id TEXT NOT NULL REFERENCES repo_files(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      line_start INTEGER NOT NULL,
      line_end INTEGER NOT NULL,
      signature TEXT,
      docstring TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_repo_symbols_file ON repo_symbols(file_id);
    CREATE INDEX IF NOT EXISTS idx_repo_symbols_project_name ON repo_symbols(project_id, name);
    CREATE INDEX IF NOT EXISTS idx_repo_symbols_kind ON repo_symbols(kind);

    -- 3. Track module imports and dependencies
    CREATE TABLE IF NOT EXISTS repo_dependencies (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_file_id TEXT NOT NULL REFERENCES repo_files(id) ON DELETE CASCADE,
      target_module TEXT NOT NULL,
      imported_symbols TEXT,
      is_external INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_repo_deps_source ON repo_dependencies(source_file_id);
    CREATE INDEX IF NOT EXISTS idx_repo_deps_target ON repo_dependencies(target_module);

    -- 4. SQLite FTS5 Virtual Table for sub-millisecond code full-text search
    CREATE VIRTUAL TABLE IF NOT EXISTS repo_code_fts USING fts5(
      file_path,
      project_id UNINDEXED,
      content,
      tokenize = 'porter unicode61'
    );
  `,
};
