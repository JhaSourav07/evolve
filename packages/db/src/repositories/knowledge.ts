import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { EvolveDatabase } from '../connection.js';
import { knowledge, type KnowledgeRecord, type NewKnowledgeRecord } from '../schema/index.js';

export class KnowledgeRepository {
  constructor(private readonly db: EvolveDatabase) {}

  public upsert(data: NewKnowledgeRecord): KnowledgeRecord {
    const existing = this.findByKey(data.key, data.projectId ?? undefined);
    if (existing) {
      const updated = this.db
        .update(knowledge)
        .set({
          content: data.content,
          confidence: data.confidence ?? existing.confidence,
          tags: data.tags !== undefined ? data.tags : existing.tags,
          sourceSessionId: data.sourceSessionId ?? existing.sourceSessionId,
          sourceEventId: data.sourceEventId ?? existing.sourceEventId,
          sourceType: data.sourceType ?? existing.sourceType,
          verificationStatus: data.verificationStatus ?? existing.verificationStatus,
          evidenceJson: data.evidenceJson ?? existing.evidenceJson,
          supersededBy: data.supersededBy ?? existing.supersededBy,
          updatedAt: Date.now(),
        })
        .where(eq(knowledge.id, existing.id))
        .returning()
        .get();
      if (!updated) {
        throw new Error('Failed to update knowledge record');
      }
      return updated;
    }

    const created = this.db.insert(knowledge).values(data).returning().get();
    if (!created) {
      throw new Error('Failed to insert knowledge record');
    }
    return created;
  }

  public findById(id: string): KnowledgeRecord | undefined {
    return this.db.select().from(knowledge).where(eq(knowledge.id, id)).get();
  }

  public delete(id: string): boolean {
    const deleted = this.db.delete(knowledge).where(eq(knowledge.id, id)).returning().get();
    return Boolean(deleted);
  }

  public listAll(projectId?: string): KnowledgeRecord[] {
    if (projectId) {
      return this.db
        .select()
        .from(knowledge)
        .where(eq(knowledge.projectId, projectId))
        .orderBy(desc(knowledge.updatedAt))
        .all();
    }
    return this.db.select().from(knowledge).orderBy(desc(knowledge.updatedAt)).all();
  }

  public findByKey(key: string, projectId?: string): KnowledgeRecord | undefined {
    if (projectId) {
      return this.db
        .select()
        .from(knowledge)
        .where(
          and(
            eq(knowledge.key, key),
            eq(knowledge.projectId, projectId),
            ne(knowledge.verificationStatus, 'deprecated'),
          ),
        )
        .get();
    }
    return this.db
      .select()
      .from(knowledge)
      .where(and(eq(knowledge.key, key), ne(knowledge.verificationStatus, 'deprecated')))
      .get();
  }

  public listByCategory(category: string, projectId?: string): KnowledgeRecord[] {
    if (projectId) {
      return this.db
        .select()
        .from(knowledge)
        .where(and(eq(knowledge.category, category), eq(knowledge.projectId, projectId)))
        .orderBy(desc(knowledge.confidence))
        .all();
    }
    return this.db
      .select()
      .from(knowledge)
      .where(eq(knowledge.category, category))
      .orderBy(desc(knowledge.confidence))
      .all();
  }

  public listByStatus(status: string, projectId?: string): KnowledgeRecord[] {
    if (projectId) {
      return this.db
        .select()
        .from(knowledge)
        .where(and(eq(knowledge.verificationStatus, status), eq(knowledge.projectId, projectId)))
        .orderBy(desc(knowledge.updatedAt))
        .all();
    }
    return this.db
      .select()
      .from(knowledge)
      .where(eq(knowledge.verificationStatus, status))
      .orderBy(desc(knowledge.updatedAt))
      .all();
  }

  public listProposed(projectId?: string): KnowledgeRecord[] {
    return this.listByStatus('proposed', projectId);
  }

  public updateStatus(id: string, status: string, supersededBy?: string): KnowledgeRecord | undefined {
    return this.db
      .update(knowledge)
      .set({
        verificationStatus: status,
        ...(supersededBy ? { supersededBy } : {}),
        updatedAt: Date.now(),
      })
      .where(eq(knowledge.id, id))
      .returning()
      .get();
  }

  public incrementAccessCount(id: string): void {
    this.db
      .update(knowledge)
      .set({
        accessCount: sql`${knowledge.accessCount} + 1`,
        lastAccessedAt: Date.now(),
      })
      .where(eq(knowledge.id, id))
      .run();
  }
}
