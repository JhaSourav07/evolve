import fs from 'node:fs';
import path from 'node:path';
import { assertPathInsideWorkspace, SecurityError, type ToolExecutionContext } from '@evolve/core';

/**
 * Patterns matching sensitive configuration, credential, and secret files.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /^\.env(\..+)?$/i, // .env, .env.local, .env.production
  /^\.git\/config$/i,
  /^\.git\/credentials$/i,
  /^id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/i,
  /\.(pem|key|pfx|p12|pkcs12)$/i,
  /^\.(netrc|npmrc|pypirc)$/i,
  /^(credentials|secrets|service-account.*)\.json$/i,
];

/**
 * Checks whether a given relative or absolute file path points to a sensitive file.
 */
export function isSensitiveFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const basename = path.basename(normalized);

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(basename)) {
      return true;
    }
  }

  // Check subpath patterns such as .git/config
  if (normalized.includes('.git/config') || normalized.includes('.git/credentials')) {
    return true;
  }

  return false;
}

/**
 * Validates that a path:
 * 1. Resides strictly inside workspaceRoot (prevents path traversal).
 * 2. Does not point to or resolve via symlink to a sensitive credential file.
 * 3. Does not escape the workspace root via symlink targets.
 */
export function assertSafePath(targetPath: string, workspaceRoot: string): string {
  // 1. Path traversal check on lexical path
  const safePath = assertPathInsideWorkspace(targetPath, workspaceRoot);

  // 2. Sensitive file check
  if (isSensitiveFile(safePath) || isSensitiveFile(targetPath)) {
    throw new SecurityError(`Access to sensitive file is blocked: ${targetPath}`, {
      details: { targetPath, workspaceRoot },
    });
  }

  // 3. Symlink escape check: if file or parent exists, check canonical path
  if (fs.existsSync(safePath)) {
    const realTarget = fs.realpathSync(safePath);
    const realRoot = fs.realpathSync(workspaceRoot);
    const relToRoot = path.relative(realRoot, realTarget);

    if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
      throw new SecurityError(`Symlink path escapes workspace root: ${targetPath}`, {
        details: { targetPath, realTarget, workspaceRoot, realRoot },
      });
    }

    if (isSensitiveFile(realTarget)) {
      throw new SecurityError(`Resolved symlink points to sensitive file: ${targetPath}`, {
        details: { targetPath, realTarget },
      });
    }
  }

  return safePath;
}

/**
 * Helper to check human approval for destructive operations.
 */
export async function checkApproval(
  toolName: string,
  description: string,
  params: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<{ approved: boolean; reason?: string }> {
  if (!context.requestApproval) {
    return { approved: true };
  }

  try {
    const approved = await context.requestApproval({
      toolName,
      description,
      params,
    });

    if (!approved) {
      return {
        approved: false,
        reason: `Operation rejected: user or system denied approval for '${toolName}'.`,
      };
    }

    return { approved: true };
  } catch (err) {
    return {
      approved: false,
      reason: `Approval check error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
