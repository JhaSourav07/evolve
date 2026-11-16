import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { projects } from './projects.js';

export const repoFiles = sqliteTable(
  'repo_files',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    contentHash: text('content_hash').notNull(),
    mtime: integer('mtime').notNull(),
    size: integer('size').notNull(),
    language: text('language').notNull(),
    isTest: integer('is_test').notNull().default(0),
    indexedAt: integer('indexed_at').notNull(),
  },
  (table) => [
    index('idx_repo_files_project_path').on(table.projectId, table.path),
    index('idx_repo_files_hash').on(table.contentHash),
  ],
);

export const repoSymbols = sqliteTable(
  'repo_symbols',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    fileId: text('file_id')
      .notNull()
      .references(() => repoFiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull(), // 'function' | 'class' | 'interface' | 'type' | 'method' | 'variable'
    lineStart: integer('line_start').notNull(),
    lineEnd: integer('line_end').notNull(),
    signature: text('signature'),
    docstring: text('docstring'),
  },
  (table) => [
    index('idx_repo_symbols_file').on(table.fileId),
    index('idx_repo_symbols_project_name').on(table.projectId, table.name),
    index('idx_repo_symbols_kind').on(table.kind),
  ],
);

export const repoDependencies = sqliteTable(
  'repo_dependencies',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sourceFileId: text('source_file_id')
      .notNull()
      .references(() => repoFiles.id, { onDelete: 'cascade' }),
    targetModule: text('target_module').notNull(),
    importedSymbols: text('imported_symbols'), // JSON array string
    isExternal: integer('is_external').notNull().default(0),
  },
  (table) => [
    index('idx_repo_deps_source').on(table.sourceFileId),
    index('idx_repo_deps_target').on(table.targetModule),
  ],
);

export type RepoFileRecord = typeof repoFiles.$inferSelect;
export type NewRepoFileRecord = typeof repoFiles.$inferInsert;

export type RepoSymbolRecord = typeof repoSymbols.$inferSelect;
export type NewRepoSymbolRecord = typeof repoSymbols.$inferInsert;

export type RepoDependencyRecord = typeof repoDependencies.$inferSelect;
export type NewRepoDependencyRecord = typeof repoDependencies.$inferInsert;
