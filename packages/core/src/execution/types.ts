import { z } from 'zod';

export const CommandRiskLevelSchema = z.enum(['low', 'medium', 'high', 'blocked']);
export type CommandRiskLevel = z.infer<typeof CommandRiskLevelSchema>;

export const VerificationStageSchema = z.enum(['lint', 'typecheck', 'test', 'build', 'custom']);
export type VerificationStage = z.infer<typeof VerificationStageSchema>;

export interface CommandRiskAnalysis {
  risk: CommandRiskLevel;
  reason?: string | undefined;
  destructive: boolean;
  requiresApproval: boolean;
}

export interface VerificationResult {
  stage: VerificationStage | string;
  command: string;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  errorTrace?: string | undefined;
}

export interface TaskExecutionResult {
  taskId: string;
  status: 'completed' | 'failed' | 'cancelled';
  durationMs: number;
  filesModified: string[];
  verifications: VerificationResult[];
  evaluationId?: string | undefined;
  error?: string | undefined;
}

export interface PlanExecutionResult {
  planId: string;
  sessionId: string;
  status: 'completed' | 'failed' | 'cancelled';
  durationMs: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasks: TaskExecutionResult[];
  error?: string | undefined;
}

export interface PlanExecutionOptions {
  autoApprove?: boolean | undefined;
  maxDebugAttempts?: number | undefined;
  stopOnFailure?: boolean | undefined;
  verifyAfterTask?: boolean | undefined;
  customTestCommand?: string | undefined;
}
