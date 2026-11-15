import { and, desc, eq } from 'drizzle-orm';
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

  public findByKey(key: string, projectId?: string): KnowledgeRecord | undefined {
    if (projectId) {
      return this.db
        .select()
        .from(knowledge)
        .where(and(eq(knowledge.key, key), eq(knowledge.projectId, projectId)))
        .get();
    }
    return this.db.select().from(knowledge).where(eq(knowledge.key, key)).get();
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
}
