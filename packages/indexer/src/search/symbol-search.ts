import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { SymbolKind } from '../parsers/types.js';
import type { ReferenceMatch, SymbolMatch, SymbolSearchOptions } from './types.js';

export class SymbolSearchEngine {
  private readonly sqlite: Database.Database;
  private readonly rootDir: string;

  constructor(sqlite: Database.Database, rootDir: string) {
    this.sqlite = sqlite;
    this.rootDir = path.resolve(rootDir);
  }

  /**
   * Finds symbol definitions by name, kind, or exact match.
   */
  public findSymbols(nameQuery: string, options: SymbolSearchOptions = {}): SymbolMatch[] {
    const trimmed = nameQuery.trim();
    if (!trimmed) return [];

    const maxResults = options.maxResults ?? 50;
    const exact = options.exactMatch ?? false;

    let sql = `
      SELECT s.id, s.name, s.kind, s.line_start, s.line_end, s.signature, s.docstring, f.path as file_path
      FROM repo_symbols s
      JOIN repo_files f ON s.file_id = f.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (options.projectId) {
      sql += ' AND s.project_id = ?';
      params.push(options.projectId);
    }

    if (options.kind) {
      sql += ' AND s.kind = ?';
      params.push(options.kind);
    }

    if (exact) {
      sql += ' AND s.name = ?';
      params.push(trimmed);
    } else {
      sql += ' AND s.name LIKE ?';
      params.push(`%${trimmed}%`);
    }

    sql += ' ORDER BY CASE WHEN s.name = ? THEN 1 WHEN s.name LIKE ? THEN 2 ELSE 3 END, s.name ASC LIMIT ?';
    params.push(trimmed, `${trimmed}%`, maxResults);

    const rows = this.sqlite.prepare(sql).all(...params) as Array<{
      id: string;
      name: string;
      kind: string;
      line_start: number;
      line_end: number;
      signature: string | null;
      docstring: string | null;
      file_path: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind as SymbolKind,
      filePath: r.file_path,
      lineStart: r.line_start,
      lineEnd: r.line_end,
      signature: r.signature ?? undefined,
      docstring: r.docstring ?? undefined,
    }));
  }

  /**
   * Finds references and call sites to a given symbol across repository files.
   */
  public findReferences(
    symbolName: string,
    options: { projectId?: string | undefined; maxResults?: number | undefined } = {},
  ): ReferenceMatch[] {
    const trimmed = symbolName.trim();
    if (!trimmed) return [];

    const maxResults = options.maxResults ?? 50;
    const matches: ReferenceMatch[] = [];

    // 1. Search for explicit import references in repo_dependencies
    let depSql = `
      SELECT d.imported_symbols, f.path as file_path
      FROM repo_dependencies d
      JOIN repo_files f ON d.source_file_id = f.id
      WHERE d.imported_symbols LIKE ?
    `;
    const depParams: unknown[] = [`%"${trimmed}"%`];

    if (options.projectId) {
      depSql += ' AND d.project_id = ?';
      depParams.push(options.projectId);
    }

    const depRows = this.sqlite.prepare(depSql).all(...depParams) as Array<{
      imported_symbols: string;
      file_path: string;
    }>;

    for (const row of depRows) {
      const fullPath = path.join(this.rootDir, row.file_path);
      if (fs.existsSync(fullPath)) {
        try {
          const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i] ?? '';
            if (line.includes('import') && line.includes(trimmed)) {
              matches.push({
                symbolName: trimmed,
                filePath: row.file_path,
                line: i + 1,
                lineContent: line.trim(),
                isImport: true,
              });
              break;
            }
          }
        } catch {
          // Skip
        }
      }
    }

    // 2. Search for code occurrences across files using FTS or regex
    const regex = new RegExp(`\\b${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    let fileSql = 'SELECT path FROM repo_files';
    const fileParams: unknown[] = [];
    if (options.projectId) {
      fileSql += ' WHERE project_id = ?';
      fileParams.push(options.projectId);
    }

    const fileRows = this.sqlite.prepare(fileSql).all(...fileParams) as Array<{ path: string }>;

    for (const f of fileRows) {
      if (matches.length >= maxResults) break;
      const fullPath = path.join(this.rootDir, f.path);
      if (!fs.existsSync(fullPath)) continue;

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= maxResults) break;
          const line = lines[i] ?? '';
          if (regex.test(line)) {
            // Check if already recorded as import
            const already = matches.some((m) => m.filePath === f.path && m.line === i + 1);
            if (!already) {
              matches.push({
                symbolName: trimmed,
                filePath: f.path,
                line: i + 1,
                lineContent: line.trim(),
                isImport: line.includes('import ') || line.includes('require('),
              });
            }
          }
        }
      } catch {
        // Skip
      }
    }

    return matches.slice(0, maxResults);
  }
}
