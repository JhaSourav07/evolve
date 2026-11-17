import { z } from 'zod';

export const UserPromptPayloadSchema = z.object({
  prompt: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const AssistantResponsePayloadSchema = z.object({
  content: z.string(),
  model: z.string().optional(),
  thinking: z.string().optional(),
  finishReason: z.string().optional(),
});

export const ToolCallPayloadSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
});

export const ToolResultPayloadSchema = z.object({
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  output: z.string().optional(),
  error: z.string().optional(),
  success: z.boolean(),
});

export const CommandExecutionPayloadSchema = z.object({
  commandId: z.string().min(1),
  command: z.string().min(1),
  cwd: z.string().min(1),
  timeoutMs: z.number().int().positive().optional(),
});

export const ExecutionResultPayloadSchema = z.object({
  commandId: z.string().min(1),
  command: z.string().min(1),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number().nonnegative(),
});

export const HumanFeedbackPayloadSchema = z.object({
  feedbackId: z.string().min(1),
  rating: z.number().int().optional(),
  feedbackType: z.string().min(1),
  notes: z.string().optional(),
  toolCallId: z.string().optional(),
});

export const SolutionAcceptedPayloadSchema = z.object({
  summary: z.string().min(1),
  acceptedAt: z.number().int().positive(),
  filesChanged: z.array(z.string()).optional(),
});

export const SolutionRejectedPayloadSchema = z.object({
  reason: z.string().min(1),
  rejectedAt: z.number().int().positive(),
  feedback: z.string().optional(),
});

export const SessionStartedPayloadSchema = z.object({
  goal: z.string().min(1),
  workspaceRoot: z.string().min(1),
  modelConfig: z.record(z.string(), z.unknown()).optional(),
});

export const SessionCompletedPayloadSchema = z.object({
  success: z.boolean(),
  durationMs: z.number().nonnegative(),
  summary: z.string().optional(),
  error: z.string().optional(),
});

export const PlanCreatedPayloadSchema = z.object({
  planId: z.string().min(1),
  title: z.string().min(1),
  taskCount: z.number().int().nonnegative(),
  mode: z.enum(['quick', 'detailed']),
  estimatedComplexity: z.enum(['low', 'medium', 'high']),
  overallRisk: z.enum(['low', 'medium', 'high']),
});

export const PlanUpdatedPayloadSchema = z.object({
  planId: z.string().min(1),
  changesSummary: z.string().min(1),
  revision: z.number().int().positive(),
});

export const PlanApprovedPayloadSchema = z.object({
  planId: z.string().min(1),
  approvedAt: z.number().int().positive(),
  notes: z.string().optional(),
});

export const PlanRejectedPayloadSchema = z.object({
  planId: z.string().min(1),
  rejectedAt: z.number().int().positive(),
  reason: z.string().optional(),
});

export const PlanRegeneratedPayloadSchema = z.object({
  previousPlanId: z.string().min(1),
  newPlanId: z.string().min(1),
  feedback: z.string().optional(),
});

export const ExecutionStartedPayloadSchema = z.object({
  planId: z.string().min(1),
  sessionId: z.string().min(1),
  totalTasks: z.number().int().nonnegative(),
  mode: z.enum(['quick', 'detailed']).default('detailed'),
});

export const TaskStartedPayloadSchema = z.object({
  planId: z.string().min(1),
  taskId: z.string().min(1),
  taskIndex: z.number().int().nonnegative(),
  title: z.string().min(1),
  riskLevel: z.string().default('low'),
});

export const ToolCallRequestedPayloadSchema = z.object({
  planId: z.string().min(1),
  taskId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
});

export const ToolExecutionStartedPayloadSchema = z.object({
  planId: z.string().min(1),
  taskId: z.string().min(1),
  toolName: z.string().min(1),
  toolCallId: z.string().min(1),
});

export const ToolExecutionCompletedPayloadSchema = z.object({
  planId: z.string().min(1),
  taskId: z.string().min(1),
  toolName: z.string().min(1),
  toolCallId: z.string().min(1),
  durationMs: z.number().nonnegative(),
  success: z.boolean(),
  outputSummary: z.string().optional(),
});

export const ToolExecutionFailedPayloadSchema = z.object({
  planId: z.string().min(1),
  taskId: z.string().min(1),
  toolName: z.string().min(1),
  toolCallId: z.string().min(1),
  error: z.string().min(1),
});

export const VerificationStartedPayloadSchema = z.object({
  planId: z.string().min(1),
  taskId: z.string().min(1),
  stage: z.string().min(1),
});

export const VerificationCompletedPayloadSchema = z.object({
  planId: z.string().min(1),
  taskId: z.string().min(1),
  stage: z.string().min(1),
  success: z.boolean(),
  durationMs: z.number().nonnegative(),
  error: z.string().optional(),
});

export const TaskCompletedPayloadSchema = z.object({
  planId: z.string().min(1),
  taskId: z.string().min(1),
  durationMs: z.number().nonnegative(),
  filesModified: z.array(z.string()).default([]),
});

export const TaskFailedPayloadSchema = z.object({
  planId: z.string().min(1),
  taskId: z.string().min(1),
  error: z.string().min(1),
  recoverable: z.boolean().default(false),
});

export const ExecutionCancelledPayloadSchema = z.object({
  planId: z.string().min(1),
  reason: z.string().min(1),
  completedTasks: z.number().int().nonnegative(),
  remainingTasks: z.number().int().nonnegative(),
});

export const ExecutionCompletedPayloadSchema = z.object({
  planId: z.string().min(1),
  sessionId: z.string().min(1),
  success: z.boolean(),
  durationMs: z.number().nonnegative(),
  tasksCompleted: z.number().int().nonnegative(),
  tasksFailed: z.number().int().nonnegative(),
});

export const EventSchemas = {
  user_prompt: UserPromptPayloadSchema,
  assistant_response: AssistantResponsePayloadSchema,
  tool_call: ToolCallPayloadSchema,
  tool_result: ToolResultPayloadSchema,
  command_execution: CommandExecutionPayloadSchema,
  execution_result: ExecutionResultPayloadSchema,
  human_feedback: HumanFeedbackPayloadSchema,
  solution_accepted: SolutionAcceptedPayloadSchema,
  solution_rejected: SolutionRejectedPayloadSchema,
  session_started: SessionStartedPayloadSchema,
  session_completed: SessionCompletedPayloadSchema,
  plan_created: PlanCreatedPayloadSchema,
  plan_updated: PlanUpdatedPayloadSchema,
  plan_approved: PlanApprovedPayloadSchema,
  plan_rejected: PlanRejectedPayloadSchema,
  plan_regenerated: PlanRegeneratedPayloadSchema,
  execution_started: ExecutionStartedPayloadSchema,
  task_started: TaskStartedPayloadSchema,
  tool_call_requested: ToolCallRequestedPayloadSchema,
  tool_execution_started: ToolExecutionStartedPayloadSchema,
  tool_execution_completed: ToolExecutionCompletedPayloadSchema,
  tool_execution_failed: ToolExecutionFailedPayloadSchema,
  verification_started: VerificationStartedPayloadSchema,
  verification_completed: VerificationCompletedPayloadSchema,
  task_completed: TaskCompletedPayloadSchema,
  task_failed: TaskFailedPayloadSchema,
  execution_cancelled: ExecutionCancelledPayloadSchema,
  execution_completed: ExecutionCompletedPayloadSchema,
} as const;

export type CoreEventType = keyof typeof EventSchemas;

export type EventPayloadMap = {
  [K in CoreEventType]: z.infer<(typeof EventSchemas)[K]>;
};

export type EventInputPayloadMap = {
  [K in CoreEventType]: z.input<(typeof EventSchemas)[K]>;
};
