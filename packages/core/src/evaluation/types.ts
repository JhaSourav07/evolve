import { z } from 'zod';

export const FeedbackLevelSchema = z.enum(['response', 'action', 'task']);
export type FeedbackLevel = z.infer<typeof FeedbackLevelSchema>;

export const ActionRatingSchema = z.enum([
  'correct_tool_selection',
  'incorrect_tool_selection',
  'successful_action',
  'failed_action',
  'unnecessary_action',
  'unsafe_action',
]);
export type ActionRating = z.infer<typeof ActionRatingSchema>;

export interface TaskRatings {
  requirementSatisfaction: number; // 1 to 5
  codeQuality: number; // 1 to 5
  architecture: number; // 1 to 5
  correctness: number; // 1 to 5
  completeness: number; // 1 to 5
  overallRating: number; // 1 to 5
}

export const QualityDimensionSchema = z.enum([
  'functional_correctness',
  'requirement_coverage',
  'test_coverage_evidence',
  'code_maintainability',
  'architectural_consistency',
  'security_considerations',
  'error_handling',
  'regression_risk',
]);
export type QualityDimension = z.infer<typeof QualityDimensionSchema>;

export const QualityAssessmentResultSchema = z.enum([
  'positive',
  'partial',
  'negative',
  'unverified',
]);
export type QualityAssessmentResult = z.infer<typeof QualityAssessmentResultSchema>;

export const EvaluationSourceSchema = z.enum([
  'automated_verification',
  'git_diff_analysis',
  'model_judgment',
  'human_feedback',
  'static_analysis',
]);
export type EvaluationSource = z.infer<typeof EvaluationSourceSchema>;

export interface QualityDimensionAssessment {
  dimension: QualityDimension;
  result: QualityAssessmentResult;
  supportingEvidence: string;
  confidence: number; // 0.0 to 1.0
  source: EvaluationSource;
}

export const FailureCategorySchema = z.enum([
  'incorrect_implementation',
  'missing_requirement',
  'repository_misunderstanding',
  'incorrect_tool_selection',
  'command_execution_failure',
  'test_failure',
  'build_failure',
  'context_retrieval_failure',
  'planning_failure',
  'model_reasoning_failure',
  'user_requirement_ambiguity',
]);
export type FailureCategory = z.infer<typeof FailureCategorySchema>;

export interface FailureClassification {
  category: FailureCategory;
  explanation: string;
  evidence?: string | undefined;
}

export const EvaluationOverallStatusSchema = z.enum([
  'verified',
  'verified_with_limitations',
  'unverified',
  'failed',
]);
export type EvaluationOverallStatus = z.infer<typeof EvaluationOverallStatusSchema>;

export interface TaskEvaluationReport {
  id: string;
  projectId: string;
  sessionId: string;
  planId?: string | undefined;
  taskId?: string | undefined;
  taskTitle: string;
  overallStatus: EvaluationOverallStatus;
  requirementCoverage: 'complete' | 'partial' | 'missing' | 'untested';
  testStatus: 'passed' | 'failed' | 'skipped' | 'none';
  buildStatus: 'passed' | 'failed' | 'skipped' | 'none';
  typecheckStatus: 'passed' | 'failed' | 'skipped' | 'none';
  lintStatus: 'passed' | 'failed' | 'skipped' | 'none';
  gitDiffStatus: 'reviewed' | 'unreviewed' | 'clean' | 'suspicious';
  dimensions: QualityDimensionAssessment[];
  failures: FailureClassification[];
  evidenceSummary: Record<string, unknown>;
  markdownReport: string;
  userFeedbackStatus: 'pending' | 'received' | 'skipped';
  trainingEligible: boolean;
  trainingEligibilityReason?: string | undefined;
  createdAt: number;
  updatedAt?: number | undefined;
}

export interface TrainingDataFilter {
  minRating?: number | undefined;
  verificationStatus?: 'verified' | 'verified_with_limitations' | 'failed' | undefined;
  projectId?: string | undefined;
  sourceModel?: string | undefined;
  failureCategories?: FailureCategory[] | undefined;
  qualityDimension?: QualityDimension | undefined;
  limit?: number | undefined;
}

export interface EligibleTrainingItem {
  evaluationId: string;
  sessionId: string;
  prompt: string;
  response: string;
  critique: string;
  isSuccessful: boolean;
  pairType: 'sft_demonstration' | 'dpo_chosen' | 'dpo_rejected';
  metadata: Record<string, unknown>;
  createdAt: number;
}
