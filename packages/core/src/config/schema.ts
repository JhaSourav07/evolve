import { z } from 'zod';

export const ModelConfigSchema = z.object({
  provider: z.enum(['ollama', 'custom']).default('ollama'),
  model: z.string().min(1).default('qwen2.5-coder:7b'),
  baseUrl: z.string().url().default('http://localhost:11434'),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().default(60_000),
});

export const WorkspaceConfigSchema = z.object({
  rootDir: z.string().min(1),
  maxFileSizeKb: z.number().int().positive().default(500),
  ignoredPatterns: z.array(z.string()).default(['node_modules/**', '.git/**', 'dist/**']),
});

export const SecurityConfigSchema = z.object({
  allowedPaths: z.array(z.string()).default([]),
  deniedPaths: z.array(z.string()).default(['.git/config', '.env*', '**/*.pem', '**/*.key']),
  allowShellExecution: z.boolean().default(true),
  requireApprovalForCommands: z.boolean().default(true),
  commandTimeoutMs: z.number().int().positive().default(30_000),
});

export const StorageConfigSchema = z.object({
  dbPath: z.string().default('.evolve/evolve.db'),
  enableWal: z.boolean().default(true),
});

export const EvolveConfigSchema = z.object({
  model: ModelConfigSchema.default(() => ModelConfigSchema.parse({})),
  workspace: WorkspaceConfigSchema,
  security: SecurityConfigSchema.default(() => SecurityConfigSchema.parse({})),
  storage: StorageConfigSchema.default(() => StorageConfigSchema.parse({})),
  maxStepsPerSession: z.number().int().positive().default(50),
});
