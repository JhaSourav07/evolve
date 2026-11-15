import path from 'node:path';
import type { z } from 'zod';
import { PathTraversalError, ValidationError } from '../errors/specific.js';
import { err, ok, type Result } from './result.js';

/**
 * Safely validates unknown data against a Zod schema, returning a Result monad.
 */
export function safeValidate<T>(schema: z.ZodType<T>, data: unknown): Result<T, ValidationError> {
  const parsed = schema.safeParse(data);
  if (parsed.success) {
    return ok(parsed.data);
  }
  return err(
    new ValidationError('Schema validation failed', {
      details: parsed.error.issues,
    }),
  );
}

/**
 * Validates data against a Zod schema or throws a structured ValidationError.
 */
export function validateOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = safeValidate(schema, data);
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/**
 * Verifies if targetPath resolves strictly within the workspaceRoot directory.
 * Prevents path traversal vulnerabilities (e.g. "../../../etc/passwd").
 */
export function isPathInsideWorkspace(targetPath: string, workspaceRoot: string): boolean {
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedTarget = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(resolvedRoot, targetPath);

  const relative = path.relative(resolvedRoot, resolvedTarget);

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Asserts that targetPath is inside workspaceRoot and returns the resolved path.
 * Throws PathTraversalError if outside.
 */
export function assertPathInsideWorkspace(targetPath: string, workspaceRoot: string): string {
  if (!isPathInsideWorkspace(targetPath, workspaceRoot)) {
    throw new PathTraversalError(targetPath, {
      details: { targetPath, workspaceRoot },
    });
  }

  const resolvedRoot = path.resolve(workspaceRoot);
  return path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(resolvedRoot, targetPath);
}
