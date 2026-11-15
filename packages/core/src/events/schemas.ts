import { z } from 'zod';

export const UserPromptPayloadSchema = z.object({
  prompt: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const AssistantResponsePayloadSchema = z.object({
  content: z.string(),
  model: z.string().optional(),
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
} as const;

export type CoreEventType = keyof typeof EventSchemas;

export type EventPayloadMap = {
  [K in CoreEventType]: z.infer<(typeof EventSchemas)[K]>;
};

export type EventInputPayloadMap = {
  [K in CoreEventType]: z.input<(typeof EventSchemas)[K]>;
};
