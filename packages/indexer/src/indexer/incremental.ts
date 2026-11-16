import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { createExclusionFilter } from '../discovery/exclusions.js';
import { detectLanguageByExtension } from '../discovery/languages.js';
import { ParserRegistry } from '../parsers/registry.js';
import type { ParsedFileResult } from '../parsers/types.js';

export interface IndexStats {
  projectId: string;
  totalFiles: number;
  addedFiles: number;
  modifiedFiles: number;
  unchangedFiles: number;
  deletedFiles: number;
  totalSymbols: number;
  durationMs: number;
}

export interface IndexerOptions {
  maxFileSize?: number; // default 2MB
  forceFullReindex?: boolean;
}

interface ExistingFileRow {
  id: string;
  content_hash: string;
  mtime: number;
  size: number;
}

export class RepositoryIndexer {
  private readonly sqlite: Database.Database;
  private readonly parserRegistry: ParserRegistry;

  constructor(sqlite: Database.Database, parserRegistry = new ParserRegistry()) {
    this.sqlite = sqlite;
    this.parserRegistry = parserRegistry;
  }

  /**
   * Incrementally indexes a repository folder into SQLite and FTS5.
   */
  public async index(
    rootDir: string,
    projectId: string,
    options: IndexerOptions = {},
  ): Promise<IndexStats> {
    const startTime = Date.now();
    const resolvedRoot = path.resolve(rootDir);
    const maxFileSize = options.maxFileSize ?? 2 * 1024 * 1024; // 2MB limit per file

    const filter = createExclusionFilter(resolvedRoot);

    let addedFiles = 0;
    let modifiedFiles = 0;
    let unchangedFiles = 0;
    let deletedFiles = 0;
    let totalSymbols = 0;

    // Prepared statements
    const selectFileStmt = this.sqlite.prepare(
      'SELECT id, content_hash, mtime, size FROM repo_files WHERE project_id = ? AND path = ?',
    );
    const insertFileStmt = this.sqlite.prepare(`
      INSERT OR REPLACE INTO repo_files (
        id, project_id, path, content_hash, mtime, size, language, is_test, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateFileMtimeStmt = this.sqlite.prepare(
      'UPDATE repo_files SET mtime = ?, indexed_at = ? WHERE id = ?',
    );
    const deleteFileStmt = this.sqlite.prepare(
      'DELETE FROM repo_files WHERE id = ?',
    );
    const deleteSymbolsStmt = this.sqlite.prepare(
      'DELETE FROM repo_symbols WHERE file_id = ?',
    );
    const deleteDepsStmt = this.sqlite.prepare(
      'DELETE FROM repo_dependencies WHERE source_file_id = ?',
    );
    const deleteFtsStmt = this.sqlite.prepare(
      'DELETE FROM repo_code_fts WHERE project_id = ? AND file_path = ?',
    );
    const insertFtsStmt = this.sqlite.prepare(
      'INSERT INTO repo_code_fts (file_path, project_id, content) VALUES (?, ?, ?)',
    );
    const insertSymbolStmt = this.sqlite.prepare(`
      INSERT INTO repo_symbols (
        id, project_id, file_id, name, kind, line_start, line_end, signature, docstring
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertDepStmt = this.sqlite.prepare(`
      INSERT INTO repo_dependencies (
        id, project_id, source_file_id, target_module, imported_symbols, is_external
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Collect all paths currently known in DB for this project
    const existingDbFiles = this.sqlite
      .prepare('SELECT id, path FROM repo_files WHERE project_id = ?')
      .all(projectId) as Array<{ id: string; path: string }>;
    const seenPaths = new Set<string>();

    // Walk disk
    const diskFiles: string[] = [];
    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(resolvedRoot, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          if (!filter.isExcluded(relPath, true)) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          if (!filter.isExcluded(relPath, false)) {
            diskFiles.push(relPath);
          }
        }
      }
    };

    walk(resolvedRoot);

    // Process files inside transactions in batches for high SQLite write performance
    const batchSize = 100;
    for (let i = 0; i < diskFiles.length; i += batchSize) {
      const batch = diskFiles.slice(i, i + batchSize);

      const processBatch = this.sqlite.transaction(() => {
        for (const relPath of batch) {
          seenPaths.add(relPath);
          const fullPath = path.join(resolvedRoot, relPath);

          let stat: fs.Stats;
          try {
            stat = fs.statSync(fullPath);
          } catch {
            continue;
          }

          if (stat.size > maxFileSize) {
            continue; // Skip oversized files
          }

          const mtimeMs = Math.floor(stat.mtimeMs);
          const existing = selectFileStmt.get(projectId, relPath) as ExistingFileRow | undefined;

          // FAST PATH: If file size & mtime match, skip read/hashing entirely
          if (
            !options.forceFullReindex &&
            existing &&
            existing.size === stat.size &&
            Math.abs(existing.mtime - mtimeMs) < 1000
          ) {
            unchangedFiles++;
            continue;
          }

          // Read content and compute SHA-256
          let content: string;
          try {
            content = fs.readFileSync(fullPath, 'utf-8');
          } catch {
            continue;
          }

          const contentHash = crypto.createHash('sha256').update(content).digest('hex');

          // SLOW CHECK: If content hash still matches (e.g. touched file), just update mtime
          if (!options.forceFullReindex && existing && existing.content_hash === contentHash) {
            updateFileMtimeStmt.run(mtimeMs, Date.now(), existing.id);
            unchangedFiles++;
            continue;
          }

          const fileId = `file_${crypto.createHash('sha1').update(`${projectId}:${relPath}`).digest('hex').slice(0, 16)}`;
          const isAdded = !existing;
          const language = detectLanguageByExtension(relPath);
          const isTest = relPath.includes('.test.') || relPath.includes('.spec.') || relPath.startsWith('tests/') || relPath.startsWith('test/') ? 1 : 0;

          // Parse AST & symbols
          let parsed: ParsedFileResult = { symbols: [], dependencies: [], exports: [] };
          try {
            parsed = this.parserRegistry.parseFile(relPath, content, language);
          } catch {
            // Parser fault tolerance: proceed with text indexing even if AST parser fails
          }

          // Clean up old associated data if updating existing file
          if (!isAdded) {
            deleteSymbolsStmt.run(fileId);
            deleteDepsStmt.run(fileId);
            deleteFtsStmt.run(projectId, relPath);
          }

          // 1. Insert/Update repo_files
          insertFileStmt.run(
            fileId,
            projectId,
            relPath,
            contentHash,
            mtimeMs,
            stat.size,
            language,
            isTest,
            Date.now(),
          );

          // 2. Insert into FTS5
          deleteFtsStmt.run(projectId, relPath);
          insertFtsStmt.run(relPath, projectId, content);

          // 3. Insert symbols
          for (const sym of parsed.symbols) {
            const symId = `sym_${crypto.randomUUID().slice(0, 12)}`;
            insertSymbolStmt.run(
              symId,
              projectId,
              fileId,
              sym.name,
              sym.kind,
              sym.lineStart,
              sym.lineEnd,
              sym.signature ?? null,
              sym.docstring ?? null,
            );
            totalSymbols++;
          }

          // 4. Insert dependencies
          for (const dep of parsed.dependencies) {
            const depId = `dep_${crypto.randomUUID().slice(0, 12)}`;
            insertDepStmt.run(
              depId,
              projectId,
              fileId,
              dep.targetModule,
              JSON.stringify(dep.importedSymbols),
              dep.isExternal ? 1 : 0,
            );
          }

          if (isAdded) {
            addedFiles++;
          } else {
            modifiedFiles++;
          }
        }
      });

      processBatch();
    }

    // Prune deleted files
    const deleteTransaction = this.sqlite.transaction(() => {
      for (const oldFile of existingDbFiles) {
        if (!seenPaths.has(oldFile.path)) {
          deleteSymbolsStmt.run(oldFile.id);
          deleteDepsStmt.run(oldFile.id);
          deleteFileStmt.run(oldFile.id);
          deleteFtsStmt.run(projectId, oldFile.path);
          deletedFiles++;
        }
      }
    });

    deleteTransaction();

    return {
      projectId,
      totalFiles: diskFiles.length,
      addedFiles,
      modifiedFiles,
      unchangedFiles,
      deletedFiles,
      totalSymbols,
      durationMs: Date.now() - startTime,
    };
  }
}
