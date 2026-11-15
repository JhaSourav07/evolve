import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { EvolveDatabase } from '../connection.js';
import { KnowledgeRepository } from '../repositories/knowledge.js';
import type {
  MemoryCategory,
  MemoryItem,
  MemorySearchOptions,
  MemorySearchResult,
  SaveMemoryOptions,
} from './types.js';

/**
 * Sanitizes input text into a safe SQLite FTS5 boolean query.
 * Extracts alphanumeric words, handles stemming prefixes, and joins with OR.
 */
export function sanitizeFtsQuery(rawQuery: string): string {
  const words = rawQuery
    .replace(/[^\w\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  if (words.length === 0) {
    return '';
  }

  return words.map((w) => `"${w}"*`).join(' OR ');
}

export class MemoryService {
  private readonly knowledgeRepo: KnowledgeRepository;

  constructor(
    private readonly db: EvolveDatabase,
    private readonly sqlite: Database.Database,
  ) {
    this.knowledgeRepo = new KnowledgeRepository(db);
  }

  /**
   * Saves or updates a user preference (e.g. style rules, tooling conventions).
   */
  public savePreference(key: string, content: string, options?: SaveMemoryOptions): MemoryItem {
    return this.saveMemory('user_preference', key, content, options);
  }

  /**
   * Saves or updates a project-specific rule or architectural fact.
   */
  public saveProjectRule(
    projectId: string,
    key: string,
    content: string,
    options?: Omit<SaveMemoryOptions, 'projectId'>,
  ): MemoryItem {
    return this.saveMemory('project_rule', key, content, {
      ...options,
      projectId,
    });
  }

  /**
   * Saves an experience memory (e.g. a problem-solution reflection from past tasks).
   */
  public saveExperience(key: string, content: string, options?: SaveMemoryOptions): MemoryItem {
    return this.saveMemory('experience', key, content, options);
  }

  /**
   * Core persistence: Upserts into relational 'knowledge' table AND syncs FTS5 index.
   */
  public saveMemory(
    category: MemoryCategory,
    key: string,
    content: string,
    options?: SaveMemoryOptions,
  ): MemoryItem {
    const existing = this.knowledgeRepo.findByKey(key, options?.projectId);
    const id = existing?.id ?? `mem_${randomUUID()}`;
    const now = Date.now();

    const tagsStr = options?.tags
      ? Array.isArray(options.tags)
        ? options.tags.join(' ')
        : options.tags
      : (existing?.tags ?? null);

    const record = this.knowledgeRepo.upsert({
      id,
      projectId: options?.projectId ?? null,
      category,
      key,
      content,
      tags: tagsStr,
      confidence: options?.confidence ?? 1.0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    // Synchronize FTS5 virtual index
    try {
      this.sqlite.prepare('DELETE FROM memory_fts WHERE id = ?').run(id);

      this.sqlite
        .prepare(
          'INSERT INTO memory_fts(id, project_id, category, key, content, tags) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          record.id,
          record.projectId ?? null,
          record.category,
          record.key,
          record.content,
          record.tags ?? null,
        );
    } catch {
      // Graceful fallback if FTS5 table is not initialized
    }

    return record;
  }

  /**
   * Performs BM25-ranked keyword search using SQLite FTS5 over memories and past experiences.
   */
  public search(query: string, options?: MemorySearchOptions): MemorySearchResult[] {
    const limit = options?.limit ?? 10;
    const ftsQuery = sanitizeFtsQuery(query);

    if (!ftsQuery) {
      // Fall back to listing recent memories if query yields no searchable terms
      const recent = this.knowledgeRepo.listAll(options?.projectId);
      return recent.slice(0, limit).map((m) => ({
        ...m,
        rank: 0,
      }));
    }

    const conditions: string[] = ['memory_fts MATCH ?'];
    const params: unknown[] = [ftsQuery];

    if (options?.projectId) {
      conditions.push('(project_id = ? OR project_id IS NULL)');
      params.push(options.projectId);
    }

    if (options?.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }

    params.push(limit);

    const sql = `
      SELECT id, project_id as projectId, category, key, content, tags, bm25(memory_fts) as rank
      FROM memory_fts
      WHERE ${conditions.join(' AND ')}
      ORDER BY rank
      LIMIT ?
    `;

    try {
      const rows = this.sqlite.prepare(sql).all(...params) as Array<{
        id: string;
        projectId: string | null;
        category: MemoryCategory;
        key: string;
        content: string;
        tags: string | null;
        rank: number;
      }>;

      return rows.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        category: r.category,
        key: r.key,
        content: r.content,
        tags: r.tags,
        confidence: 1.0,
        createdAt: 0,
        updatedAt: 0,
        rank: r.rank,
      }));
    } catch {
      // Fallback if FTS search fails
      return [];
    }
  }

  public listPreferences(projectId?: string): MemoryItem[] {
    return this.knowledgeRepo.listByCategory('user_preference', projectId);
  }

  public listProjectRules(projectId: string): MemoryItem[] {
    return this.knowledgeRepo.listByCategory('project_rule', projectId);
  }

  public listExperiences(projectId?: string): MemoryItem[] {
    return this.knowledgeRepo.listByCategory('experience', projectId);
  }

  public delete(id: string): boolean {
    const deleted = this.knowledgeRepo.delete(id);
    if (deleted) {
      try {
        this.sqlite.prepare('DELETE FROM memory_fts WHERE id = ?').run(id);
      } catch {
        // ignore
      }
    }
    return deleted;
  }
}
