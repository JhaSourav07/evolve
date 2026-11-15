import { desc, eq } from 'drizzle-orm';
import type { EvolveDatabase } from '../connection.js';
import {
  trainingExamples,
  type NewTrainingExampleRecord,
  type TrainingExampleRecord,
} from '../schema/index.js';

export class TrainingRepository {
  constructor(private readonly db: EvolveDatabase) {}

  public record(data: NewTrainingExampleRecord): TrainingExampleRecord {
    const created = this.db.insert(trainingExamples).values(data).returning().get();
    if (!created) {
      throw new Error('Failed to record training example');
    }
    return created;
  }

  public listSuccessful(limit = 100): TrainingExampleRecord[] {
    return this.db
      .select()
      .from(trainingExamples)
      .where(eq(trainingExamples.isSuccessful, 1))
      .orderBy(desc(trainingExamples.createdAt))
      .limit(limit)
      .all();
  }
}
