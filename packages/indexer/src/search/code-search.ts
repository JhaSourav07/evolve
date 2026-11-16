import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { CodeMatch, CodeSearchOptions, CodeSearchResult } from './types.js';

export class CodeSearchEngine {
  private readonly sqlite: Database.Database;
  private readonly rootDir: string;

  constructor(sqlite: Database.Database, rootDir: string) {
    this.sqlite = sqlite;
    this.rootDir = path.resolve(rootDir);
  }

  /**
   * Searches for code matching query across indexed repository files.
   * Utilizes SQLite FTS5 full-text indexing, with line-number resolution.
   */
  public search(query: string, options: CodeSearchOptions = {}): CodeSearchResult {
    const trimmed = query.trim();
    if (!trimmed) {
      return { query, matches: [], totalMatches: 0 };
    }

    const isRegex = options.isRegex ?? false;

    if (isRegex) {
      return this.searchRegex(trimmed, options);
    }

    try {
      return this.searchFts(trimmed, options);
    } catch {
      // If FTS syntax error (e.g. unclosed quote), fall back to literal regex search
      return this.searchRegex(trimmed, options);
    }
  }

  private searchFts(query: string, options: CodeSearchOptions): CodeSearchResult {
    const maxResults = options.maxResults ?? 50;

    // Sanitize query for SQLite FTS5
    // Escape double quotes and support term matching
    const sanitized = query
      .replace(/"/g, '""')
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term}"*`)
      .join(' AND ');

    if (!sanitized) {
      return { query, matches: [], totalMatches: 0 };
    }

    let sql = `
      SELECT file_path, snippet(repo_code_fts, 2, '[[', ']]', '...', 15) as snippet, bm25(repo_code_fts) as rank
      FROM repo_code_fts
      WHERE repo_code_fts MATCH ?
    `;
    const params: unknown[] = [sanitized];

    if (options.projectId) {
      sql += ' AND project_id = ?';
      params.push(options.projectId);
    }

    sql += ' ORDER BY rank LIMIT 100';

    const rows = this.sqlite.prepare(sql).all(...params) as Array<{
      file_path: string;
      snippet: string;
      rank: number;
    }>;

    const matches: CodeMatch[] = [];
    const queryLower = query.toLowerCase();

    for (const row of rows) {
      if (matches.length >= maxResults) break;

      if (options.pathFilter && !row.file_path.includes(options.pathFilter)) {
        continue;
      }

      const fullPath = path.join(this.rootDir, row.file_path);
      if (!fs.existsSync(fullPath)) continue;

      try {
        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        const lines = fileContent.split('\n');

        let fileHadExactMatch = false;
        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= maxResults) break;

          const line = lines[i] ?? '';
          if (line.toLowerCase().includes(queryLower)) {
            matches.push({
              file: row.file_path,
              line: i + 1,
              text: line.trim(),
            });
            fileHadExactMatch = true;
          }
        }

        // If no literal line match found, use snippet match line
        if (!fileHadExactMatch && matches.length < maxResults) {
          matches.push({
            file: row.file_path,
            line: 1,
            text: row.snippet.replace(/\[\[|\]\]/g, '').trim(),
            snippet: row.snippet,
          });
        }
      } catch {
        // Skip unreadable files
      }
    }

    return {
      query,
      matches: matches.slice(0, maxResults),
      totalMatches: matches.length,
    };
  }

  private searchRegex(pattern: string, options: CodeSearchOptions): CodeSearchResult {
    const maxResults = options.maxResults ?? 50;
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'i');
    } catch {
      regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    let sql = 'SELECT path FROM repo_files';
    const params: unknown[] = [];
    if (options.projectId) {
      sql += ' WHERE project_id = ?';
      params.push(options.projectId);
    }

    const rows = this.sqlite.prepare(sql).all(...params) as Array<{ path: string }>;
    const matches: CodeMatch[] = [];

    for (const row of rows) {
      if (matches.length >= maxResults) break;
      if (options.pathFilter && !row.path.includes(options.pathFilter)) continue;

      const fullPath = path.join(this.rootDir, row.path);
      if (!fs.existsSync(fullPath)) continue;

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= maxResults) break;
          const line = lines[i] ?? '';
          if (regex.test(line)) {
            matches.push({
              file: row.path,
              line: i + 1,
              text: line.trim(),
            });
          }
        }
      } catch {
        // Skip
      }
    }

    return {
      query: pattern,
      matches,
      totalMatches: matches.length,
    };
  }
}
