import { z } from 'zod';

export const CommandRiskLevelSchema = z.enum(['low', 'medium', 'high', 'blocked']);
export type CommandRiskLevel = z.infer<typeof CommandRiskLevelSchema>;

export const VerificationStageSchema = z.enum(['lint', 'typecheck', 'test', 'build', 'custom']);
export type VerificationStage = z.infer<typeof VerificationStageSchema>;

export interface CommandRiskAnalysis {
  risk: CommandRiskLevel;
  reason?: string;
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
  errorTrace?: string;
}

export interface TaskExecutionResult {
  taskId: string;
  status: 'completed' | 'failed' | 'cancelled';
  durationMs: number;
  filesModified: string[];
  verifications: VerificationResult[];
  error?: string;
}

export interface PlanExecutionResult {
  planId: string;
  sessionId: string;
  status: 'completed' | 'failed' | 'cancelled';
  durationMs: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasks: TaskExecutionResult[];
  error?: string;
}

export interface PlanExecutionOptions {
  autoApprove?: boolean;
  maxDebugAttempts?: number;
  stopOnFailure?: boolean;
  verifyAfterTask?: boolean;
  customTestCommand?: string;
}
