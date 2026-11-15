import type { z } from 'zod';
import type {
  EvolveConfigSchema,
  ModelConfigSchema,
  SecurityConfigSchema,
  StorageConfigSchema,
  WorkspaceConfigSchema,
} from './schema.js';

export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type EvolveConfig = z.infer<typeof EvolveConfigSchema>;
export type EvolveConfigInput = z.input<typeof EvolveConfigSchema>;
