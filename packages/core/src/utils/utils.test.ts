import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { err, isErr, isOk, ok, unwrap, unwrapOr } from './result.js';
import {
  assertPathInsideWorkspace,
  isPathInsideWorkspace,
  safeValidate,
  validateOrThrow,
} from './validation.js';

describe('Result Monad', () => {
  it('handles ok cases correctly', () => {
    const success = ok(42);
    expect(isOk(success)).toBe(true);
    expect(isErr(success)).toBe(false);
    expect(unwrap(success)).toBe(42);
    expect(unwrapOr(success, 0)).toBe(42);
  });

  it('handles err cases correctly', () => {
    const failure = err(new Error('Failed'));
    expect(isOk(failure)).toBe(false);
    expect(isErr(failure)).toBe(true);
    expect(() => unwrap(failure)).toThrow('Failed');
    expect(unwrapOr(failure, 99)).toBe(99);
  });
});

describe('Validation Utilities', () => {
  const schema = z.object({
    name: z.string().min(3),
    count: z.number().int().positive(),
  });

  it('validates valid data with safeValidate', () => {
    const result = safeValidate(schema, { name: 'Alice', count: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Alice');
    }
  });

  it('returns ValidationError on invalid data with safeValidate', () => {
    const result = safeValidate(schema, { name: 'Al', count: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED');
      expect(result.error.details).toBeDefined();
    }
  });

  it('validates or throws with validateOrThrow', () => {
    expect(validateOrThrow(schema, { name: 'Bob', count: 1 })).toEqual({
      name: 'Bob',
      count: 1,
    });
    expect(() => validateOrThrow(schema, { name: 'X' })).toThrow();
  });
});

describe('Workspace Path Security Check', () => {
  const workspaceRoot = '/home/user/workspace';

  it('allows valid relative and absolute paths inside the workspace', () => {
    expect(isPathInsideWorkspace('src/index.ts', workspaceRoot)).toBe(true);
    expect(isPathInsideWorkspace('./nested/file.txt', workspaceRoot)).toBe(true);
    expect(isPathInsideWorkspace('/home/user/workspace/src/app.ts', workspaceRoot)).toBe(true);
    expect(assertPathInsideWorkspace('src/index.ts', workspaceRoot)).toBe(
      '/home/user/workspace/src/index.ts',
    );
  });

  it('blocks path traversal attacks outside workspace', () => {
    expect(isPathInsideWorkspace('../secret.txt', workspaceRoot)).toBe(false);
    expect(isPathInsideWorkspace('../../etc/passwd', workspaceRoot)).toBe(false);
    expect(isPathInsideWorkspace('/etc/passwd', workspaceRoot)).toBe(false);
    expect(() => assertPathInsideWorkspace('../../etc/passwd', workspaceRoot)).toThrow(
      'Path traversal attempt detected',
    );
  });
});
