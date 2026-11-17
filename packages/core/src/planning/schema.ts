import { z } from 'zod';

export const ComplexityLevelSchema = z.enum(['low', 'medium', 'high']);
export type ComplexityLevel = z.infer<typeof ComplexityLevelSchema>;

export const RiskLevelSchema = z.enum(['low', 'medium', 'high']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const PlanModeSchema = z.enum(['quick', 'detailed']);
export type PlanMode = z.infer<typeof PlanModeSchema>;

export const PlanStatusSchema = z.enum([
  'draft',
  'awaiting_approval',
  'approved',
  'rejected',
  'superseded',
]);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const TaskStatusSchema = z.enum([
  'pending',
  'ready',
  'blocked',
  'completed',
  'failed',
  'cancelled',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskDependencySchema = z.object({
  fromTaskId: z.string().min(1).describe('The dependency prerequisite task ID'),
  toTaskId: z.string().min(1).describe('The dependent task ID that requires the prerequisite'),
});
export type TaskDependency = z.infer<typeof TaskDependencySchema>;

export const PlanTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  objective: z.string(),
  relevantFiles: z.array(z.string()).default([]),
  expectedChanges: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  verificationSteps: z.array(z.string()).default([]),
  estimatedComplexity: ComplexityLevelSchema.default('medium'),
  estimatedRisk: RiskLevelSchema.default('low'),
  potentialRisks: z.array(z.string()).default([]),
  affectedComponents: z.array(z.string()).default([]),
  breakingChange: z.boolean().default(false),
  securityImplications: z.string().optional(),
  status: TaskStatusSchema.default('pending'),
});
export type PlanTask = z.infer<typeof PlanTaskSchema>;

export const ProjectRiskAssessmentSchema = z.object({
  overallRisk: RiskLevelSchema.default('medium'),
  overallComplexity: ComplexityLevelSchema.default('medium'),
  summary: z.string().default(''),
  criticalRisks: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  securityConsiderations: z.array(z.string()).default([]),
  dataMigrationConsiderations: z.array(z.string()).default([]),
  testingRequirements: z.array(z.string()).default([]),
});
export type ProjectRiskAssessment = z.infer<typeof ProjectRiskAssessmentSchema>;

export const StructuredRequirementsSchema = z.object({
  primaryObjective: z.string().min(1),
  expectedOutcome: z.string(),
  functionalRequirements: z.array(z.string()).default([]),
  technicalConstraints: z.array(z.string()).default([]),
  relevantComponents: z.array(z.string()).default([]),
  potentialAmbiguities: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
});
export type StructuredRequirements = z.infer<typeof StructuredRequirementsSchema>;

export const PlanSchema = z.object({
  planId: z.string().min(1),
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  objective: z.string().min(1),
  mode: PlanModeSchema.default('detailed'),
  requirements: StructuredRequirementsSchema,
  assumptions: z.array(z.string()).default([]),
  tasks: z.array(PlanTaskSchema).min(1, 'A plan must contain at least one task'),
  dependencies: z.array(TaskDependencySchema).default([]),
  risks: ProjectRiskAssessmentSchema.default(() => ProjectRiskAssessmentSchema.parse({})),
  acceptanceCriteria: z.array(z.string()).default([]),
  estimatedComplexity: ComplexityLevelSchema.default('medium'),
  status: PlanStatusSchema.default('awaiting_approval'),
  revision: z.number().int().positive().default(1),
  supersededBy: z.string().optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});
export type Plan = z.infer<typeof PlanSchema>;
export type PlanInput = z.input<typeof PlanSchema>;

