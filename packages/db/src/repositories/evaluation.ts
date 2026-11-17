import { and, desc, eq } from 'drizzle-orm';
import type { EvolveDatabase } from '../connection.js';
import { evaluations, type EvaluationRecord, type NewEvaluationRecord } from '../schema/index.js';

export class EvaluationRepository {
  constructor(private readonly db: EvolveDatabase) {}

  public record(data: NewEvaluationRecord): EvaluationRecord {
    const existing = data.taskId ? this.findByTaskId(data.taskId) : undefined;
    if (existing) {
      const updated = this.db
        .update(evaluations)
        .set({
          overallStatus: data.overallStatus,
          requirementCoverage: data.requirementCoverage,
          testStatus: data.testStatus,
          buildStatus: data.buildStatus,
          typecheckStatus: data.typecheckStatus,
          lintStatus: data.lintStatus,
          gitDiffStatus: data.gitDiffStatus,
          qualityDimensionsJson: data.qualityDimensionsJson,
          failureClassificationsJson: data.failureClassificationsJson,
          evidenceSummaryJson: data.evidenceSummaryJson,
          markdownReport: data.markdownReport,
          userFeedbackStatus: data.userFeedbackStatus ?? existing.userFeedbackStatus,
          trainingEligible: data.trainingEligible ?? existing.trainingEligible,
          trainingEligibilityReason:
            data.trainingEligibilityReason ?? existing.trainingEligibilityReason,
          updatedAt: Date.now(),
        })
        .where(eq(evaluations.id, existing.id))
        .returning()
        .get();

      if (!updated) {
        throw new Error('Failed to update evaluation record');
      }
      return updated;
    }

    const created = this.db.insert(evaluations).values(data).returning().get();
    if (!created) {
      throw new Error('Failed to insert evaluation record');
    }
    return created;
  }

  public findById(id: string): EvaluationRecord | undefined {
    return this.db.select().from(evaluations).where(eq(evaluations.id, id)).get();
  }

  public findByTaskId(taskId: string): EvaluationRecord | undefined {
    return this.db.select().from(evaluations).where(eq(evaluations.taskId, taskId)).get();
  }

  public listByProject(projectId: string, limit: number = 50): EvaluationRecord[] {
    return this.db
      .select()
      .from(evaluations)
      .where(eq(evaluations.projectId, projectId))
      .orderBy(desc(evaluations.createdAt))
      .limit(limit)
      .all();
  }

  public listAll(limit: number = 50): EvaluationRecord[] {
    return this.db
      .select()
      .from(evaluations)
      .orderBy(desc(evaluations.createdAt))
      .limit(limit)
      .all();
  }

  public listBySession(sessionId: string): EvaluationRecord[] {
    return this.db
      .select()
      .from(evaluations)
      .where(eq(evaluations.sessionId, sessionId))
      .orderBy(desc(evaluations.createdAt))
      .all();
  }

  public listByPlan(planId: string): EvaluationRecord[] {
    return this.db
      .select()
      .from(evaluations)
      .where(eq(evaluations.planId, planId))
      .orderBy(desc(evaluations.createdAt))
      .all();
  }

  public listByStatus(status: string, projectId?: string): EvaluationRecord[] {
    if (projectId) {
      return this.db
        .select()
        .from(evaluations)
        .where(and(eq(evaluations.overallStatus, status), eq(evaluations.projectId, projectId)))
        .orderBy(desc(evaluations.createdAt))
        .all();
    }
    return this.db
      .select()
      .from(evaluations)
      .where(eq(evaluations.overallStatus, status))
      .orderBy(desc(evaluations.createdAt))
      .all();
  }

  public listTrainingEligible(projectId?: string): EvaluationRecord[] {
    if (projectId) {
      return this.db
        .select()
        .from(evaluations)
        .where(and(eq(evaluations.trainingEligible, true), eq(evaluations.projectId, projectId)))
        .orderBy(desc(evaluations.createdAt))
        .all();
    }
    return this.db
      .select()
      .from(evaluations)
      .where(eq(evaluations.trainingEligible, true))
      .orderBy(desc(evaluations.createdAt))
      .all();
  }

  public updateUserFeedbackStatus(id: string, status: string): EvaluationRecord | undefined {
    return this.db
      .update(evaluations)
      .set({
        userFeedbackStatus: status,
        updatedAt: Date.now(),
      })
      .where(eq(evaluations.id, id))
      .returning()
      .get();
  }

  public delete(id: string): boolean {
    const deleted = this.db.delete(evaluations).where(eq(evaluations.id, id)).returning().get();
    return Boolean(deleted);
  }
}
