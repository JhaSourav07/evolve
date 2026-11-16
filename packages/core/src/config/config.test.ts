import { describe, expect, it } from 'vitest';
import { EvolveConfigSchema, ModelConfigSchema } from './schema.js';

describe('Configuration Schemas', () => {
  it('applies smart defaults to model config', () => {
    const config = ModelConfigSchema.parse({});
    expect(config.provider).toBe('ollama');
    expect(config.model).toBe('qwen2.5-coder:7b');
    expect(config.baseUrl).toBe('http://localhost:11434');
    expect(config.temperature).toBe(0.2);
    expect(config.contextWindow).toBe(32_768);
    expect(config.timeoutMs).toBe(60_000);
  });

  it('validates complete Evolve config with defaults', () => {
    const parsed = EvolveConfigSchema.parse({
      workspace: {
        rootDir: '/home/user/project',
      },
    });

    expect(parsed.workspace.rootDir).toBe('/home/user/project');
    expect(parsed.workspace.maxFileSizeKb).toBe(500);
    expect(parsed.model.model).toBe('qwen2.5-coder:7b');
    expect(parsed.security.allowShellExecution).toBe(true);
    expect(parsed.storage.dbPath).toBe('.evolve/evolve.db');
    expect(parsed.maxStepsPerSession).toBe(50);
  });

  it('rejects invalid configurations', () => {
    expect(() =>
      EvolveConfigSchema.parse({
        // missing required workspace.rootDir
      }),
    ).toThrow();

    expect(() =>
      ModelConfigSchema.parse({
        temperature: 5, // exceeds max 2
      }),
    ).toThrow();
  });
});
