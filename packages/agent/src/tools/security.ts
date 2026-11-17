import fs from 'node:fs';
import path from 'node:path';
import {
  assertPathInsideWorkspace,
  type CommandRiskAnalysis,
  SecurityError,
  type ToolExecutionContext,
} from '@evolve/core';

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

/**
 * Known secret and token patterns for output redaction.
 */
const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // AWS access key IDs
  {
    pattern: /\b(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: '[REDACTED_AWS_KEY]',
  },
  // GitHub Personal Access Tokens and OAuth tokens
  {
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  // GitLab Personal Access Tokens
  {
    pattern: /\bglpat-[0-9a-zA-Z_-]{20,}\b/g,
    replacement: '[REDACTED_GITLAB_TOKEN]',
  },
  // Slack Tokens
  {
    pattern: /\bxox[baprs]-[0-9a-zA-Z-]{10,}\b/g,
    replacement: '[REDACTED_SLACK_TOKEN]',
  },
  // Standard JSON Web Tokens (JWT)
  {
    pattern: /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g,
    replacement: '[REDACTED_JWT]',
  },
  // OpenAI / Anthropic API keys
  {
    pattern: /\bsk-(?:live-|test-|ant-)?[A-Za-z0-9_-]{20,}\b/g,
    replacement: '[REDACTED_API_KEY]',
  },
  // Private Key Blocks
  {
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
  // Common key-value assignments containing secrets (e.g. password=..., api_key="...")
  {
    pattern: /(?<=\b(?:password|passwd|api_key|apikey|secret|auth_token|access_token|private_key)\s*[:=]\s*["']?)[^"'\s\n]{8,}(?=["']?)/gi,
    replacement: '[REDACTED_SECRET]',
  },
];

/**
 * Scrubs known secret and credential patterns from text outputs.
 */
export function scrubSecrets(text: string): string {
  if (!text) return text;
  let result = text;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Classifies command risk into BLOCKED, HIGH, MEDIUM, or LOW.
 */
export function classifyCommandRisk(command: string): CommandRiskAnalysis {
  const trimmed = command.trim();
  const lower = trimmed.toLowerCase();

  // 1. BLOCKED commands (Unacceptable security risks)
  const blockedPatterns: Array<{ regex: RegExp; reason: string }> = [
    { regex: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: 'Fork bomb detected' },
    { regex: /\b(?:sudo|doas|su)\b/, reason: 'Privilege escalation commands are forbidden' },
    { regex: /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?(\/|~\/?|\/\*)$/, reason: 'Root or home directory destruction detected' },
    { regex: /\brm\s+-[a-zA-Z]*rf\s+(\/|~\/?|\/\*)$/, reason: 'Root or home directory destruction detected' },
    { regex: /\b(?:shutdown|reboot|poweroff|halt|init\s+[06])\b/, reason: 'System shutdown or reboot commands are forbidden' },
    { regex: /\b(?:mkfs(\.[a-z0-9]+)?|fdisk|parted)\b/, reason: 'Disk formatting or partitioning commands are forbidden' },
    { regex: />\s*\/dev\/(?:sd[a-z]|nvme[0-9]|hd[a-z])/, reason: 'Direct device write detected' },
    { regex: /\bdd\s+if=.*of=\/dev\//, reason: 'Raw device overwrite detected' },
    { regex: /(?:curl|wget)\s+[^|]+\|\s*(?:ba)?sh\b/, reason: 'Piping remote scripts directly to shell is forbidden' },
  ];

  for (const { regex, reason } of blockedPatterns) {
    if (regex.test(trimmed) || regex.test(lower)) {
      return {
        risk: 'blocked',
        reason,
        destructive: true,
        requiresApproval: true,
      };
    }
  }

  // 2. HIGH risk commands (Destructive, requiring human approval)
  const highRiskPatterns: Array<{ regex: RegExp; reason: string }> = [
    { regex: /\brm\s+-[a-zA-Z]*[rf]/, reason: 'Recursive file deletion' },
    { regex: /\brimraf\b/, reason: 'Recursive directory deletion' },
    { regex: /\bgit\s+reset\s+--hard\b/, reason: 'Hard git reset will discard uncommitted changes' },
    { regex: /\bgit\s+clean\s+-[a-zA-Z]*f\b/, reason: 'Force git clean will delete untracked files' },
    { regex: /\bgit\s+push\s+.*--force\b|\bgit\s+push\s+.*-f\b/, reason: 'Force push can overwrite remote history' },
    { regex: /\bgit\s+branch\s+-[a-zA-Z]*D\b/, reason: 'Forced branch deletion' },
    { regex: /\bkill\s+-9\b|\bpkill\b|\bkillall\b/, reason: 'Force process termination' },
    { regex: /\b(?:dropdb|drop\s+database|prisma\s+migrate\s+reset)\b/, reason: 'Database drop or reset' },
    { regex: /\b(?:npm|pnpm|yarn)\s+publish\b/, reason: 'Package publishing operation' },
  ];

  for (const { regex, reason } of highRiskPatterns) {
    if (regex.test(trimmed) || regex.test(lower)) {
      return {
        risk: 'high',
        reason,
        destructive: true,
        requiresApproval: true,
      };
    }
  }

  // 3. MEDIUM risk commands (Modifying workspace dependencies, git refs, or files)
  const mediumRiskPatterns = [
    /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|update)\b/,
    /\b(?:pip|pip3|poetry)\s+(?:install|add|remove)\b/,
    /\bcargo\s+(?:add|install|remove)\b/,
    /\bgit\s+(?:checkout|switch|merge|rebase|stash|pull)\b/,
    /\b(?:mkdir|touch|cp|mv|chmod|chown)\b/,
  ];

  for (const regex of mediumRiskPatterns) {
    if (regex.test(trimmed) || regex.test(lower)) {
      return {
        risk: 'medium',
        destructive: false,
        requiresApproval: false,
      };
    }
  }

  // 4. LOW risk commands (Safe inspection, testing, building)
  return {
    risk: 'low',
    destructive: false,
    requiresApproval: false,
  };
}
