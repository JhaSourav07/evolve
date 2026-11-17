import { desc, eq } from 'drizzle-orm';
import type { Plan, PlanStatus, PlanTask } from '@evolve/core';
import type { EvolveDatabase } from '../connection.js';
import {
  plans,
  planTasks,
  planRevisions,
  type PlanRow,
  type PlanTaskRow,
  type PlanRevisionRow,
} from '../schema/plans.js';

export class PlanRepository {
  constructor(private readonly db: EvolveDatabase) {}

  public create(plan: Plan): void {
    this.db
      .insert(plans)
      .values({
        id: plan.planId,
        sessionId: plan.sessionId,
        projectId: plan.projectId,
        title: plan.title,
        objective: plan.objective,
        mode: plan.mode,
        status: plan.status,
        revision: plan.revision,
        supersededBy: plan.supersededBy ?? null,
        requirementsJson: JSON.stringify(plan.requirements),
        assumptionsJson: JSON.stringify(plan.assumptions),
        risksJson: JSON.stringify(plan.risks),
        acceptanceCriteriaJson: JSON.stringify(plan.acceptanceCriteria),
        estimatedComplexity: plan.estimatedComplexity,
        overallRisk: plan.risks.overallRisk,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
      })
      .run();

    if (plan.tasks.length > 0) {
      for (let i = 0; i < plan.tasks.length; i++) {
        const task = plan.tasks[i]!;
        this.db
          .insert(planTasks)
          .values({
            id: task.id,
            planId: plan.planId,
            title: task.title,
            description: task.description,
            objective: task.objective,
            status: task.status,
            estimatedComplexity: task.estimatedComplexity,
            estimatedRisk: task.estimatedRisk,
            relevantFilesJson: JSON.stringify(task.relevantFiles),
            expectedChangesJson: JSON.stringify(task.expectedChanges),
            dependenciesJson: JSON.stringify(task.dependencies),
            verificationStepsJson: JSON.stringify(task.verificationSteps),
            potentialRisksJson: JSON.stringify(task.potentialRisks),
            affectedComponentsJson: JSON.stringify(task.affectedComponents),
            breakingChange: task.breakingChange ? 1 : 0,
            securityImplications: task.securityImplications ?? null,
            executionOrder: i,
            createdAt: plan.createdAt,
            updatedAt: plan.updatedAt,
          })
          .run();
      }
    }

    // Save initial revision
    this.saveRevision(plan.planId, plan.revision, plan, 'Initial plan creation');
  }

  public findById(id: string): Plan | undefined {
    const row = this.db.select().from(plans).where(eq(plans.id, id)).get();
    if (!row) return undefined;
    return this.hydratePlan(row);
  }

  public findBySessionId(sessionId: string): Plan[] {
    const rows = this.db
      .select()
      .from(plans)
      .where(eq(plans.sessionId, sessionId))
      .orderBy(desc(plans.createdAt))
      .all();
    return rows.map((r) => this.hydratePlan(r));
  }

  public findByProjectId(projectId: string): Plan[] {
    const rows = this.db
      .select()
      .from(plans)
      .where(eq(plans.projectId, projectId))
      .orderBy(desc(plans.createdAt))
      .all();
    return rows.map((r) => this.hydratePlan(r));
  }

  public updateStatus(id: string, status: PlanStatus): void {
    this.db
      .update(plans)
      .set({
        status,
        updatedAt: Date.now(),
      })
      .where(eq(plans.id, id))
      .run();
  }

  public updatePlan(plan: Plan, changeSummary: string = 'Updated plan'): void {
    const nextRevision = plan.revision + 1;

    this.db
      .update(plans)
      .set({
        title: plan.title,
        objective: plan.objective,
        mode: plan.mode,
        status: plan.status,
        revision: nextRevision,
        supersededBy: plan.supersededBy ?? null,
        requirementsJson: JSON.stringify(plan.requirements),
        assumptionsJson: JSON.stringify(plan.assumptions),
        risksJson: JSON.stringify(plan.risks),
        acceptanceCriteriaJson: JSON.stringify(plan.acceptanceCriteria),
        estimatedComplexity: plan.estimatedComplexity,
        overallRisk: plan.risks.overallRisk,
        updatedAt: Date.now(),
      })
      .where(eq(plans.id, plan.planId))
      .run();

    // Replace tasks
    this.db.delete(planTasks).where(eq(planTasks.planId, plan.planId)).run();
    for (let i = 0; i < plan.tasks.length; i++) {
      const task = plan.tasks[i]!;
      this.db
        .insert(planTasks)
        .values({
          id: task.id,
          planId: plan.planId,
          title: task.title,
          description: task.description,
          objective: task.objective,
          status: task.status,
          estimatedComplexity: task.estimatedComplexity,
          estimatedRisk: task.estimatedRisk,
          relevantFilesJson: JSON.stringify(task.relevantFiles),
          expectedChangesJson: JSON.stringify(task.expectedChanges),
          dependenciesJson: JSON.stringify(task.dependencies),
          verificationStepsJson: JSON.stringify(task.verificationSteps),
          potentialRisksJson: JSON.stringify(task.potentialRisks),
          affectedComponentsJson: JSON.stringify(task.affectedComponents),
          breakingChange: task.breakingChange ? 1 : 0,
          securityImplications: task.securityImplications ?? null,
          executionOrder: i,
          createdAt: plan.createdAt,
          updatedAt: Date.now(),
        })
        .run();
    }

    // Save revision snapshot
    const updatedPlan: Plan = {
      ...plan,
      revision: nextRevision,
      updatedAt: Date.now(),
    };
    this.saveRevision(plan.planId, nextRevision, updatedPlan, changeSummary);
  }

  public saveRevision(
    planId: string,
    revision: number,
    snapshot: Plan,
    changeSummary: string,
  ): void {
    this.db
      .insert(planRevisions)
      .values({
        id: `rev_${planId}_${revision}_${Date.now()}`,
        planId,
        revision,
        snapshotJson: JSON.stringify(snapshot),
        changeSummary,
        createdAt: Date.now(),
      })
      .run();
  }

  public getRevisions(planId: string): PlanRevisionRow[] {
    return this.db
      .select()
      .from(planRevisions)
      .where(eq(planRevisions.planId, planId))
      .orderBy(desc(planRevisions.revision))
      .all();
  }

  private hydratePlan(row: PlanRow): Plan {
    const taskRows = this.db
      .select()
      .from(planTasks)
      .where(eq(planTasks.planId, row.id))
      .orderBy(planTasks.executionOrder)
      .all();

    const tasks: PlanTask[] = taskRows.map((tr) => ({
      id: tr.id,
      title: tr.title,
      description: tr.description,
      objective: tr.objective,
      status: tr.status as PlanTask['status'],
      estimatedComplexity: tr.estimatedComplexity as PlanTask['estimatedComplexity'],
      estimatedRisk: tr.estimatedRisk as PlanTask['estimatedRisk'],
      relevantFiles: JSON.parse(tr.relevantFilesJson || '[]'),
      expectedChanges: JSON.parse(tr.expectedChangesJson || '[]'),
      dependencies: JSON.parse(tr.dependenciesJson || '[]'),
      verificationSteps: JSON.parse(tr.verificationStepsJson || '[]'),
      potentialRisks: JSON.parse(tr.potentialRisksJson || '[]'),
      affectedComponents: JSON.parse(tr.affectedComponentsJson || '[]'),
      breakingChange: tr.breakingChange === 1,
      securityImplications: tr.securityImplications ?? undefined,
    }));

    // Build explicit dependencies list from task dependencies
    const dependencies: Array<{ fromTaskId: string; toTaskId: string }> = [];
    for (const t of tasks) {
      for (const depId of t.dependencies) {
        dependencies.push({ fromTaskId: depId, toTaskId: t.id });
      }
    }

    return {
      planId: row.id,
      sessionId: row.sessionId,
      projectId: row.projectId,
      title: row.title,
      objective: row.objective,
      mode: row.mode as Plan['mode'],
      status: row.status as Plan['status'],
      revision: row.revision,
      supersededBy: row.supersededBy ?? undefined,
      requirements: JSON.parse(row.requirementsJson),
      assumptions: JSON.parse(row.assumptionsJson || '[]'),
      risks: JSON.parse(row.risksJson),
      acceptanceCriteria: JSON.parse(row.acceptanceCriteriaJson || '[]'),
      estimatedComplexity: row.estimatedComplexity as Plan['estimatedComplexity'],
      tasks,
      dependencies,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

