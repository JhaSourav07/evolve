import { and, desc, eq } from 'drizzle-orm';
import type { EvolveDatabase } from '../connection.js';
import {
  modelVersions,
  type ModelVersionRecord,
  type NewModelVersionRecord,
} from '../schema/index.js';

export class ModelVersionRepository {
  constructor(private readonly db: EvolveDatabase) {}

  public register(data: NewModelVersionRecord): ModelVersionRecord {
    const created = this.db.insert(modelVersions).values(data).returning().get();
    if (!created) {
      throw new Error('Failed to register model version');
    }
    return created;
  }

  public getActive(provider = 'ollama'): ModelVersionRecord | undefined {
    return this.db
      .select()
      .from(modelVersions)
      .where(and(eq(modelVersions.provider, provider), eq(modelVersions.isActive, 1)))
      .orderBy(desc(modelVersions.installedAt))
      .get();
  }

  /**
   * Atomic multi-step transaction: sets the specified model version active
   * while deactivating other versions for the same provider.
   */
  public setActive(id: string): ModelVersionRecord {
    return this.db.transaction((tx) => {
      const target = tx.select().from(modelVersions).where(eq(modelVersions.id, id)).get();
      if (!target) {
        throw new Error(`Model version ${id} not found`);
      }

      // Deactivate all models for this provider
      tx.update(modelVersions)
        .set({ isActive: 0 })
        .where(eq(modelVersions.provider, target.provider))
        .run();

      // Activate target model
      const activated = tx
        .update(modelVersions)
        .set({ isActive: 1 })
        .where(eq(modelVersions.id, id))
        .returning()
        .get();

      if (!activated) {
        throw new Error(`Failed to activate model version ${id}`);
      }

      return activated;
    });
  }
}
