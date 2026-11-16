import path from 'node:path';
import type Database from 'better-sqlite3';
import type { FileDependencies } from './types.js';

export class DependencyGraphEngine {
  private readonly sqlite: Database.Database;

  constructor(sqlite: Database.Database) {
    this.sqlite = sqlite;
  }

  /**
   * Retrieves the imported dependencies and reverse importers for a given file.
   */
  public getDependencies(filePath: string, projectId: string): FileDependencies {
    const normalizedPath = filePath.replace(/\\/g, '/');

    // 1. Get file ID
    const fileRow = this.sqlite
      .prepare('SELECT id FROM repo_files WHERE project_id = ? AND path = ?')
      .get(projectId, normalizedPath) as { id: string } | undefined;

    const internalDeps: Array<{ module: string; symbols: string[] }> = [];
    const externalDeps: Array<{ module: string; symbols: string[] }> = [];

    if (fileRow) {
      // 2. Query dependencies declared by this file
      const depRows = this.sqlite
        .prepare(`
          SELECT target_module, imported_symbols, is_external
          FROM repo_dependencies
          WHERE project_id = ? AND source_file_id = ?
        `)
        .all(projectId, fileRow.id) as Array<{
        target_module: string;
        imported_symbols: string | null;
        is_external: number;
      }>;

      for (const row of depRows) {
        let symbols: string[] = [];
        try {
          if (row.imported_symbols) symbols = JSON.parse(row.imported_symbols) as string[];
        } catch {
          // Ignore parse errors
        }

        const entry = { module: row.target_module, symbols };
        if (row.is_external === 1) {
          externalDeps.push(entry);
        } else {
          internalDeps.push(entry);
        }
      }
    }

    // 3. Find files that import this file (reverse importers)
    // Check by target_module matching normalizedPath or its relative variants
    const basenameNoExt = path.basename(normalizedPath, path.extname(normalizedPath));
    const importerRows = this.sqlite
      .prepare(`
        SELECT f.path
        FROM repo_dependencies d
        JOIN repo_files f ON d.source_file_id = f.id
        WHERE d.project_id = ? AND (d.target_module LIKE ? OR d.target_module LIKE ?)
      `)
      .all(projectId, `%${basenameNoExt}%`, `%${normalizedPath}%`) as Array<{ path: string }>;

    const importers = Array.from(new Set(importerRows.map((r) => r.path)));

    return {
      filePath: normalizedPath,
      internalDeps,
      externalDeps,
      importers,
    };
  }

  /**
   * Finds related files connected by imports, shared dependencies, or directory proximity.
   */
  public getRelatedFiles(filePath: string, projectId: string, limit = 10): string[] {
    const deps = this.getDependencies(filePath, projectId);
    const related = new Set<string>();

    // 1. Direct importers
    for (const imp of deps.importers) {
      if (imp !== filePath) related.add(imp);
    }

    // 2. Direct internal module dependencies
    const fileDir = path.dirname(filePath);
    for (const dep of deps.internalDeps) {
      const resolved = path.normalize(path.join(fileDir, dep.module)).replace(/\\/g, '/');
      const noExt = resolved.replace(/\.[a-zA-Z0-9]+$/, '');
      const candidates = [
        resolved,
        noExt,
        `${noExt}.ts`,
        `${noExt}.tsx`,
        `${noExt}.js`,
        `${noExt}.jsx`,
        `${resolved}.ts`,
        `${resolved}/index.ts`,
        `${resolved}/index.js`,
      ];

      for (const cand of candidates) {
        const found = this.sqlite
          .prepare('SELECT path FROM repo_files WHERE project_id = ? AND path = ?')
          .get(projectId, cand) as { path: string } | undefined;
        if (found) {
          related.add(found.path);
          break;
        }
      }
    }

    // 3. Sibling files in same directory if list is small
    if (related.size < limit) {
      const siblings = this.sqlite
        .prepare(`
          SELECT path FROM repo_files
          WHERE project_id = ? AND path != ? AND path LIKE ?
          LIMIT ?
        `)
        .all(projectId, filePath, `${fileDir}/%`, limit - related.size) as Array<{ path: string }>;

      for (const s of siblings) {
        related.add(s.path);
      }
    }

    return Array.from(related).slice(0, limit);
  }
}
