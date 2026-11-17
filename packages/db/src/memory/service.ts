import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { EvolveDatabase } from '../connection.js';
import { KnowledgeRepository } from '../repositories/knowledge.js';
import type { KnowledgeRecord } from '../schema/knowledge.js';
import type {
  MemoryCategory,
  MemoryItem,
  MemorySearchOptions,
  MemorySearchResult,
  MemorySourceType,
  MemoryVerificationStatus,
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

function toMemoryItem(record: KnowledgeRecord | Record<string, unknown>): MemoryItem {
  const r = record as Record<string, unknown>;
  return {
    id: String(r.id),
    projectId: (r.projectId as string | null | undefined) ?? (r.project_id as string | null | undefined) ?? null,
    category: (r.category as MemoryCategory),
    key: String(r.key),
    content: String(r.content),
    tags: (r.tags as string | null | undefined) ?? null,
    confidence: Number(r.confidence ?? 1.0),
    sourceSessionId: (r.sourceSessionId as string | undefined) ?? (r.source_session_id as string | undefined),
    sourceEventId: (r.sourceEventId as string | undefined) ?? (r.source_event_id as string | undefined),
    sourceType: ((r.sourceType ?? r.source_type ?? 'explicit_user') as MemorySourceType),
    verificationStatus: ((r.verificationStatus ?? r.verification_status ?? 'verified') as MemoryVerificationStatus),
    evidenceJson: (r.evidenceJson as string | null | undefined) ?? (r.evidence_json as string | null | undefined),
    accessCount: Number(r.accessCount ?? r.access_count ?? 0),
    lastAccessedAt: Number(r.lastAccessedAt ?? r.last_accessed_at ?? 0),
    supersededBy: (r.supersededBy as string | undefined) ?? (r.superseded_by as string | undefined),
    createdAt: Number(r.createdAt ?? r.created_at ?? 0),
    updatedAt: Number(r.updatedAt ?? r.updated_at ?? 0),
  };
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
   * Saves an architectural decision.
   */
  public saveArchitectureDecision(
    projectId: string,
    key: string,
    content: string,
    options?: Omit<SaveMemoryOptions, 'projectId'>,
  ): MemoryItem {
    return this.saveMemory('architecture_decision', key, content, {
      ...options,
      projectId,
    });
  }

  /**
   * Saves an experience memory (e.g. a verified problem-solution reflection from past tasks).
   */
  public saveExperience(key: string, content: string, options?: SaveMemoryOptions): MemoryItem {
    return this.saveMemory('experience', key, content, options);
  }

  /**
   * Saves a failed attempt memory with root cause to prevent repeating dead ends.
   */
  public saveFailedAttempt(
    projectId: string,
    key: string,
    content: string,
    options?: Omit<SaveMemoryOptions, 'projectId'>,
  ): MemoryItem {
    return this.saveMemory('failed_attempt', key, content, {
      ...options,
      projectId,
    });
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
    const existing = this.knowledgeRepo.findByKey(key, options?.projectId ?? undefined);
    const id = existing?.id ?? `mem_${randomUUID()}`;
    const now = Date.now();

    const tagsStr = options?.tags
      ? Array.isArray(options.tags)
        ? options.tags.join(' ')
        : options.tags
      : (existing?.tags ?? null);

    const evidenceJsonStr = options?.evidence
      ? JSON.stringify(options.evidence)
      : (existing?.evidenceJson ?? null);

    const record = this.knowledgeRepo.upsert({
      id,
      projectId: options?.projectId ?? null,
      category,
      key,
      content,
      tags: tagsStr,
      confidence: options?.confidence ?? 1.0,
      sourceSessionId: options?.sourceSessionId ?? existing?.sourceSessionId ?? null,
      sourceEventId: options?.sourceEventId ?? existing?.sourceEventId ?? null,
      sourceType: options?.sourceType ?? (existing?.sourceType as MemorySourceType) ?? 'explicit_user',
      verificationStatus:
        options?.verificationStatus ??
        (existing?.verificationStatus as MemoryVerificationStatus) ??
        'verified',
      evidenceJson: evidenceJsonStr,
      supersededBy: options?.supersededBy ?? existing?.supersededBy ?? null,
      accessCount: existing?.accessCount ?? 0,
      lastAccessedAt: existing?.lastAccessedAt ?? 0,
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

    return toMemoryItem(record);
  }

  public findById(id: string): MemoryItem | undefined {
    const record = this.knowledgeRepo.findById(id);
    return record ? toMemoryItem(record) : undefined;
  }

  public findByKey(key: string, projectId?: string): MemoryItem | undefined {
    const record = this.knowledgeRepo.findByKey(key, projectId);
    return record ? toMemoryItem(record) : undefined;
  }

  /**
   * Performs BM25-ranked keyword search using SQLite FTS5 joined with the knowledge table.
   */
  public search(query: string, options?: MemorySearchOptions): MemorySearchResult[] {
    const limit = options?.limit ?? 10;
    const ftsQuery = sanitizeFtsQuery(query);

    if (!ftsQuery) {
      // Fall back to listing recent memories if query yields no searchable terms
      const recent = this.knowledgeRepo.listAll(options?.projectId);
      return recent
        .filter((r) => {
          if (!options?.includeDeprecated && r.verificationStatus === 'deprecated') {
            return false;
          }
          if (options?.verificationStatus && r.verificationStatus !== options.verificationStatus) {
            return false;
          }
          if (options?.category && r.category !== options.category) {
            return false;
          }
          return true;
        })
        .slice(0, limit)
        .map((m) => ({
          ...toMemoryItem(m),
          rank: 0,
        }));
    }

    const conditions: string[] = ['memory_fts MATCH ?'];
    const params: unknown[] = [ftsQuery];

    if (options?.projectId) {
      conditions.push('(k.project_id = ? OR k.project_id IS NULL)');
      params.push(options.projectId);
    }

    if (options?.category) {
      conditions.push('k.category = ?');
      params.push(options.category);
    }

    if (options?.verificationStatus) {
      conditions.push('k.verification_status = ?');
      params.push(options.verificationStatus);
    } else if (!options?.includeDeprecated) {
      conditions.push("k.verification_status != 'deprecated'");
    }

    params.push(limit);

    const sql = `
      SELECT k.*, bm25(memory_fts) as rank
      FROM memory_fts
      JOIN knowledge k ON k.id = memory_fts.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY rank
      LIMIT ?
    `;

    try {
      const rows = this.sqlite.prepare(sql).all(...params) as Array<KnowledgeRecord & { rank: number }>;
      return rows.map((r) => ({
        ...toMemoryItem(r),
        rank: r.rank,
      }));
    } catch {
      // Fallback: search via simple like or return empty
      return [];
    }
  }

  public listAll(projectId?: string): MemoryItem[] {
    return this.knowledgeRepo.listAll(projectId).map(toMemoryItem);
  }

  public listPreferences(projectId?: string): MemoryItem[] {
    return this.knowledgeRepo.listByCategory('user_preference', projectId).map(toMemoryItem);
  }

  public listProjectRules(projectId: string): MemoryItem[] {
    return this.knowledgeRepo.listByCategory('project_rule', projectId).map(toMemoryItem);
  }

  public listExperiences(projectId?: string): MemoryItem[] {
    return this.knowledgeRepo.listByCategory('experience', projectId).map(toMemoryItem);
  }

  public listDecisions(projectId: string): MemoryItem[] {
    return this.knowledgeRepo.listByCategory('architecture_decision', projectId).map(toMemoryItem);
  }

  public listFailedAttempts(projectId: string): MemoryItem[] {
    return this.knowledgeRepo.listByCategory('failed_attempt', projectId).map(toMemoryItem);
  }

  public listProposed(projectId?: string): MemoryItem[] {
    return this.knowledgeRepo.listProposed(projectId).map(toMemoryItem);
  }

  public listByStatus(status: MemoryVerificationStatus, projectId?: string): MemoryItem[] {
    return this.knowledgeRepo.listByStatus(status, projectId).map(toMemoryItem);
  }

  public updateStatus(
    id: string,
    status: MemoryVerificationStatus,
    supersededBy?: string,
  ): MemoryItem | undefined {
    const updated = this.knowledgeRepo.updateStatus(id, status, supersededBy);
    return updated ? toMemoryItem(updated) : undefined;
  }

  public deprecate(id: string, supersededBy?: string): MemoryItem | undefined {
    return this.updateStatus(id, 'deprecated', supersededBy);
  }

  public recordAccess(id: string): void {
    this.knowledgeRepo.incrementAccessCount(id);
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
