import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { CodeSearchEngine } from '../search/code-search.js';
import { DependencyGraphEngine } from '../search/dependency-graph.js';
import { SymbolSearchEngine } from '../search/symbol-search.js';

export interface RetrievedFileExcerpt {
  path: string;
  score: number;
  reasons: string[];
  content: string;
  lineCount: number;
  isPartial: boolean;
}

export interface RetrievedContext {
  query: string;
  files: RetrievedFileExcerpt[];
  formattedContext: string;
  estimatedTokens: number;
}

export interface ContextRetrievalOptions {
  projectId: string;
  maxTokens?: number | undefined; // default 4000 tokens
  maxFiles?: number | undefined; // default 6 files
}

export class ContextRetriever {
  private readonly sqlite: Database.Database;
  private readonly rootDir: string;
  private readonly codeSearch: CodeSearchEngine;
  private readonly symbolSearch: SymbolSearchEngine;
  private readonly depGraph: DependencyGraphEngine;

  constructor(sqlite: Database.Database, rootDir: string) {
    this.sqlite = sqlite;
    this.rootDir = path.resolve(rootDir);
    this.codeSearch = new CodeSearchEngine(sqlite, rootDir);
    this.symbolSearch = new SymbolSearchEngine(sqlite, rootDir);
    this.depGraph = new DependencyGraphEngine(sqlite);
  }

  /**
   * Retrieves compact, highly-relevant repository context for a query.
   */
  public async retrieve(
    query: string,
    options: ContextRetrievalOptions,
  ): Promise<RetrievedContext> {
    const maxTokens = options.maxTokens ?? 4000;
    const maxFiles = options.maxFiles ?? 6;
    const terms = this.extractQueryTerms(query);

    const scoredFiles = new Map<string, { score: number; reasons: string[] }>();

    const recordScore = (filePath: string, points: number, reason: string) => {
      const existing = scoredFiles.get(filePath) ?? { score: 0, reasons: [] };
      existing.score += points;
      if (!existing.reasons.includes(reason)) {
        existing.reasons.push(reason);
      }
      scoredFiles.set(filePath, existing);
    };

    // 1. Signal 1: Filename and Path match
    for (const term of terms) {
      const pathRows = this.sqlite
        .prepare(`
          SELECT path FROM repo_files
          WHERE project_id = ? AND (path LIKE ? OR path LIKE ?)
          LIMIT 20
        `)
        .all(options.projectId, `%${term}%`, `%/${term}%`) as Array<{ path: string }>;

      for (const row of pathRows) {
        recordScore(row.path, 15, `Path matches term '${term}'`);
      }
    }

    // 2. Signal 2: Symbol match
    for (const term of terms) {
      const symbols = this.symbolSearch.findSymbols(term, {
        projectId: options.projectId,
        maxResults: 15,
      });

      for (const sym of symbols) {
        recordScore(sym.filePath, 12, `Declares symbol '${sym.name}' (${sym.kind})`);
      }
    }

    // 3. Signal 3: FTS5 Content match on key terms
    for (const term of terms) {
      const ftsResults = this.codeSearch.search(term, {
        projectId: options.projectId,
        maxResults: 15,
      });

      for (const match of ftsResults.matches) {
        recordScore(match.file, 8, `Content matches keyword '${term}'`);
      }
    }

    // 4. Signal 4: Dependency Graph 1st-degree expansion for top candidate files
    const topCandidates = Array.from(scoredFiles.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 3);

    for (const [candPath] of topCandidates) {
      const related = this.depGraph.getRelatedFiles(candPath, options.projectId, 3);
      for (const rel of related) {
        recordScore(rel, 4, `Connected by import graph to '${candPath}'`);
      }
    }

    // Rank candidate files
    const ranked = Array.from(scoredFiles.entries())
      .map(([filePath, data]) => ({
        path: filePath,
        score: data.score,
        reasons: data.reasons,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxFiles);

    // Build excerpts honoring the token budget
    let tokenBudgetRemaining = maxTokens;
    const fileExcerpts: RetrievedFileExcerpt[] = [];
    const contextLines: string[] = [];

    contextLines.push('Relevant Repository Source Context:');

    for (const file of ranked) {
      if (tokenBudgetRemaining <= 200) break;

      const fullPath = path.join(this.rootDir, file.path);
      if (!fs.existsSync(fullPath)) continue;

      let content: string;
      try {
        content = fs.readFileSync(fullPath, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      const maxLinesForFile = Math.min(lines.length, Math.floor(tokenBudgetRemaining / 1.5));
      const isPartial = lines.length > maxLinesForFile;

      const excerptText = isPartial
        ? lines.slice(0, maxLinesForFile).join('\n') + `\n// ... [${lines.length - maxLinesForFile} lines truncated for context budget]`
        : content;

      const estimatedFileTokens = Math.ceil(excerptText.length / 4);
      tokenBudgetRemaining -= estimatedFileTokens;

      fileExcerpts.push({
        path: file.path,
        score: file.score,
        reasons: file.reasons,
        content: excerptText,
        lineCount: lines.length,
        isPartial,
      });

      contextLines.push('');
      contextLines.push(`--- File: ${file.path} (${file.reasons.join(', ')}) ---`);
      contextLines.push(excerptText);
    }

    const formattedContext = contextLines.join('\n');
    const estimatedTokens = Math.ceil(formattedContext.length / 4);

    return {
      query,
      files: fileExcerpts,
      formattedContext,
      estimatedTokens,
    };
  }

  private extractQueryTerms(query: string): string[] {
    // Strip common punctuation and stop words
    const STOP_WORDS = new Set([
      'the', 'a', 'an', 'is', 'in', 'at', 'of', 'on', 'and', 'or', 'for', 'to',
      'how', 'where', 'what', 'why', 'explain', 'analyse', 'analyze', 'find', 'show',
      'this', 'that', 'with', 'does', 'from', 'all', 'potential', 'problems', 'complete',
      'system', 'architecture', 'implemented', 'works', 'code', 'file', 'files',
    ]);

    const words = query
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    const terms = new Set<string>(words);

    // Expand common technical abbreviations and root stems
    for (const w of words) {
      if (w.startsWith('auth')) terms.add('auth');
      if (w.startsWith('config')) terms.add('config');
      if (w.startsWith('depend')) terms.add('dep');
      if (w.startsWith('reposit')) terms.add('repo');
      if (w.startsWith('data') || w.includes('database')) {
        terms.add('db');
        terms.add('data');
      }
      if (w.startsWith('model')) terms.add('model');
      if (w.startsWith('rout')) terms.add('route');
      if (w.startsWith('serv')) terms.add('service');
    }

    return Array.from(terms);
  }
}
