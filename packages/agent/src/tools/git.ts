import { execFile } from 'node:child_process';
import type { AgentTool } from '@evolve/core';
import { z } from 'zod';
import { assertSafePath, checkApproval, isSensitiveFile } from './security.js';

/**
 * Executes a git command safely using execFile (direct binary execution, bypassing shell).
 */
export function execGit(
  workspaceRoot: string,
  args: string[],
  timeoutMs = 15_000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    // -C enforces repository location strictly at workspaceRoot
    const fullArgs = ['-C', workspaceRoot, ...args];

    execFile(
      'git',
      fullArgs,
      {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024, // 1MB
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0', // disable interactive credentials prompts
        },
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: error?.code ? (typeof error.code === 'number' ? error.code : 1) : 0,
        });
      },
    );
  });
}

export const gitStatusTool: AgentTool<
  { path?: string | undefined },
  {
    branch: string;
    clean: boolean;
    staged: string[];
    unstaged: string[];
    untracked: string[];
  }
> = {
  definition: {
    name: 'git_status',
    description:
      'Inspects git repository status in the workspace, reporting branch, clean state, staged, unstaged, and untracked files.',
    parameters: z.object({
      path: z.string().optional().describe('Relative subfolder or file to check status for'),
    }),
  },
  async execute({ path: targetPath }, context) {
    try {
      if (targetPath) {
        assertSafePath(targetPath, context.workspaceRoot);
      }

      // Check current branch
      const branchRes = await execGit(context.workspaceRoot, ['branch', '--show-current']);
      const branch = branchRes.stdout.trim() || 'HEAD (detached)';

      // Check status porcelain
      const statusArgs = ['status', '--porcelain=v1', '-u'];
      if (targetPath) {
        statusArgs.push('--', targetPath);
      }

      const statusRes = await execGit(context.workspaceRoot, statusArgs);

      if (statusRes.exitCode !== 0) {
        return {
          success: false,
          output: `Git status failed: ${statusRes.stderr.trim() || 'Not a git repository'}`,
          error: 'NOT_A_GIT_REPO',
        };
      }

      const lines = statusRes.stdout.split('\n').filter((l) => l.trim().length > 0);
      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];

      for (const line of lines) {
        const x = line[0];
        const y = line[1];
        const file = line.slice(3).trim();

        if (x === '?' && y === '?') {
          untracked.push(file);
        } else {
          if (x && x !== ' ' && x !== '?') {
            staged.push(`${x} ${file}`);
          }
          if (y && y !== ' ' && y !== '?') {
            unstaged.push(`${y} ${file}`);
          }
        }
      }

      const isClean = staged.length === 0 && unstaged.length === 0 && untracked.length === 0;

      const summaryParts = [`Branch: ${branch}`, `Clean: ${isClean}`];
      if (staged.length > 0) {
        summaryParts.push(`Staged (${staged.length}):\n  ${staged.join('\n  ')}`);
      }
      if (unstaged.length > 0) {
        summaryParts.push(`Unstaged (${unstaged.length}):\n  ${unstaged.join('\n  ')}`);
      }
      if (untracked.length > 0) {
        summaryParts.push(`Untracked (${untracked.length}):\n  ${untracked.join('\n  ')}`);
      }

      return {
        success: true,
        output: summaryParts.join('\n\n'),
        data: {
          branch,
          clean: isClean,
          staged,
          unstaged,
          untracked,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to inspect git status: ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};

export const gitDiffTool: AgentTool<
  { staged?: boolean | undefined; path?: string | undefined; maxLines?: number | undefined },
  { diff: string; filesChanged: number; truncated: boolean }
> = {
  definition: {
    name: 'git_diff',
    description: 'Displays working tree changes or staged changes in the git repository.',
    parameters: z.object({
      staged: z
        .boolean()
        .optional()
        .describe('Show staged changes (--cached) if true, unstaged changes if false'),
      path: z.string().optional().describe('Specific file path to show diff for'),
      maxLines: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum lines of diff to return (default 200)'),
    }),
  },
  async execute({ staged = false, path: targetPath, maxLines = 200 }, context) {
    try {
      if (targetPath) {
        assertSafePath(targetPath, context.workspaceRoot);
      }

      const diffArgs = ['diff'];
      if (staged) {
        diffArgs.push('--cached');
      }

      if (targetPath) {
        // Use '--' separator to eliminate argument injection risks
        diffArgs.push('--', targetPath);
      }

      const res = await execGit(context.workspaceRoot, diffArgs);

      if (res.exitCode !== 0) {
        return {
          success: false,
          output: `Git diff failed: ${res.stderr.trim() || 'Not a git repository'}`,
          error: 'NOT_A_GIT_REPO',
        };
      }

      const rawDiff = res.stdout;
      if (!rawDiff || rawDiff.trim().length === 0) {
        return {
          success: true,
          output: staged ? 'No staged changes.' : 'No working tree changes.',
          data: {
            diff: '',
            filesChanged: 0,
            truncated: false,
          },
        };
      }

      // Count files changed (lines starting with 'diff --git')
      const diffLines = rawDiff.split('\n');
      const filesChanged = diffLines.filter((l) => l.startsWith('diff --git')).length;

      const truncated = diffLines.length > maxLines;
      const finalDiff = truncated
        ? diffLines.slice(0, maxLines).join('\n') +
          `\n\n[Warning: Diff truncated at ${maxLines} lines. Total lines: ${diffLines.length}]`
        : rawDiff;

      return {
        success: true,
        output: finalDiff,
        data: {
          diff: finalDiff,
          filesChanged: Math.max(1, filesChanged),
          truncated,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to inspect git diff: ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};

export const gitLogTool: AgentTool<
  { maxCount?: number | undefined; path?: string | undefined },
  { commits: Array<{ hash: string; author: string; date: string; message: string }>; count: number }
> = {
  definition: {
    name: 'git_log',
    description: 'Retrieves recent git commits for the repository, including hash, author, date, and message.',
    parameters: z.object({
      maxCount: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of commits to retrieve (default 10)'),
      path: z
        .string()
        .optional()
        .describe('Optional file or directory path to inspect history for'),
    }),
  },
  async execute({ maxCount = 10, path: targetPath }, context) {
    try {
      if (targetPath) {
        assertSafePath(targetPath, context.workspaceRoot);
      }

      const logArgs = [
        'log',
        `-${maxCount}`,
        '--format=%H%x1f%an%x1f%ad%x1f%s%x1e',
        '--date=short',
      ];

      if (targetPath) {
        logArgs.push('--', targetPath);
      }

      const res = await execGit(context.workspaceRoot, logArgs);

      if (res.exitCode !== 0) {
        return {
          success: false,
          output: `Git log failed: ${res.stderr.trim() || 'Not a git repository or no commits yet'}`,
          error: 'GIT_LOG_FAILED',
        };
      }

      const raw = res.stdout.trim();
      if (!raw) {
        return {
          success: true,
          output: 'No commits found.',
          data: { commits: [], count: 0 },
        };
      }

      const records = raw.split('\x1e').filter((r) => r.trim().length > 0);
      const commits = records.map((record) => {
        const [hash, author, date, message] = record.trim().split('\x1f');
        return {
          hash: hash ?? '',
          author: author ?? '',
          date: date ?? '',
          message: message ?? '',
        };
      });

      const formatted = commits
        .map((c) => `${c.hash.slice(0, 7)} [${c.date}] ${c.message} (${c.author})`)
        .join('\n');

      return {
        success: true,
        output: formatted,
        data: {
          commits,
          count: commits.length,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to retrieve git log: ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};

export const gitBranchTool: AgentTool<
  { action?: 'list' | 'create' | 'switch' | undefined; name?: string | undefined },
  { currentBranch: string; branches: string[] }
> = {
  definition: {
    name: 'git_branch',
    description: 'Lists, creates, or switches git branches safely in the workspace repository.',
    parameters: z.object({
      action: z
        .enum(['list', 'create', 'switch'])
        .optional()
        .describe("Branch action to perform: 'list' (default), 'create', or 'switch'"),
      name: z
        .string()
        .optional()
        .describe('Branch name (required for create and switch actions)'),
    }),
  },
  async execute({ action = 'list', name }, context) {
    try {
      if ((action === 'create' || action === 'switch') && !name) {
        return {
          success: false,
          output: `Branch name is required for action '${action}'.`,
          error: 'MISSING_BRANCH_NAME',
        };
      }

      if (action === 'create' && name) {
        const res = await execGit(context.workspaceRoot, ['checkout', '-b', name]);
        if (res.exitCode !== 0) {
          return {
            success: false,
            output: `Failed to create branch '${name}': ${res.stderr.trim()}`,
            error: 'BRANCH_CREATION_FAILED',
          };
        }
      } else if (action === 'switch' && name) {
        const res = await execGit(context.workspaceRoot, ['checkout', name]);
        if (res.exitCode !== 0) {
          return {
            success: false,
            output: `Failed to switch to branch '${name}': ${res.stderr.trim()}`,
            error: 'BRANCH_SWITCH_FAILED',
          };
        }
      }

      const branchRes = await execGit(context.workspaceRoot, ['branch', '--list']);
      const lines = branchRes.stdout.split('\n').filter((l) => l.trim().length > 0);
      let currentBranch = '';
      const branches: string[] = [];

      for (const line of lines) {
        const isCurrent = line.startsWith('*');
        const bName = line.replace(/^\*?\s+/, '').trim();
        branches.push(bName);
        if (isCurrent) currentBranch = bName;
      }

      const formatted = branches
        .map((b) => (b === currentBranch ? `* ${b} (active)` : `  ${b}`))
        .join('\n');

      return {
        success: true,
        output: formatted || 'No branches found.',
        data: {
          currentBranch,
          branches,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to perform branch operation: ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};

export const gitAddTool: AgentTool<
  { files: string[] },
  { stagedFiles: string[] }
> = {
  definition: {
    name: 'git_add',
    description:
      'Stages specified files for git commit, verifying paths and preventing staging of sensitive credential files.',
    parameters: z.object({
      files: z
        .array(z.string().min(1))
        .min(1)
        .describe('Array of relative file paths to stage (e.g. ["src/index.ts", "package.json"])'),
    }),
  },
  async execute({ files }, context) {
    try {
      const safePaths: string[] = [];
      for (const file of files) {
        assertSafePath(file, context.workspaceRoot);
        safePaths.push(file);
      }

      const res = await execGit(context.workspaceRoot, ['add', '--', ...safePaths]);

      if (res.exitCode !== 0) {
        return {
          success: false,
          output: `Git add failed: ${res.stderr.trim()}`,
          error: 'GIT_ADD_FAILED',
        };
      }

      return {
        success: true,
        output: `Successfully staged ${safePaths.length} file(s):\n  ${safePaths.join('\n  ')}`,
        data: {
          stagedFiles: safePaths,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to stage files: ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};

export const gitCommitTool: AgentTool<
  { message: string; allowEmpty?: boolean | undefined },
  { commitHash: string; message: string; filesCommitted: number }
> = {
  definition: {
    name: 'git_commit',
    description:
      'Creates a git commit with staged changes and the provided commit message. Requires human approval and validates that no sensitive files are staged.',
    parameters: z.object({
      message: z.string().min(1).describe('Commit message following Conventional Commits format'),
      allowEmpty: z
        .boolean()
        .optional()
        .describe('Whether to allow creating empty commits (default false)'),
    }),
  },
  async execute({ message, allowEmpty = false }, context) {
    try {
      const statusRes = await execGit(context.workspaceRoot, ['status', '--porcelain=v1']);
      if (statusRes.exitCode !== 0) {
        return {
          success: false,
          output: `Git status check failed: ${statusRes.stderr.trim()}`,
          error: 'NOT_A_GIT_REPO',
        };
      }

      const lines = statusRes.stdout.split('\n').filter((l) => l.trim().length > 0);
      const stagedFiles: string[] = [];

      for (const line of lines) {
        const x = line[0];
        const file = line.slice(3).trim();
        if (x && x !== ' ' && x !== '?') {
          if (isSensitiveFile(file)) {
            return {
              success: false,
              output: `Cannot commit: Sensitive credential file '${file}' is staged! Unstage it before committing.`,
              error: 'SENSITIVE_FILE_STAGED',
            };
          }
          stagedFiles.push(file);
        }
      }

      if (stagedFiles.length === 0 && !allowEmpty) {
        return {
          success: false,
          output: 'No changes staged for commit. Stage changes with git_add first.',
          error: 'NO_CHANGES_STAGED',
        };
      }

      const approval = await checkApproval(
        'git_commit',
        `Commit ${stagedFiles.length} file(s) with message: "${message}"`,
        { message, stagedFiles },
        context,
      );

      if (!approval.approved) {
        return {
          success: false,
          output: approval.reason ?? 'Commit operation was rejected.',
          error: 'APPROVAL_DENIED',
        };
      }

      const commitArgs = ['commit', '-m', message];
      if (allowEmpty) {
        commitArgs.push('--allow-empty');
      }

      const commitRes = await execGit(context.workspaceRoot, commitArgs);

      if (commitRes.exitCode !== 0) {
        return {
          success: false,
          output: `Git commit failed: ${commitRes.stderr.trim() || commitRes.stdout.trim()}`,
          error: 'GIT_COMMIT_FAILED',
        };
      }

      const hashRes = await execGit(context.workspaceRoot, ['rev-parse', 'HEAD']);
      const commitHash = hashRes.stdout.trim();

      return {
        success: true,
        output: `Successfully created commit ${commitHash.slice(0, 7)}: ${message}\nFiles committed: ${stagedFiles.length}`,
        data: {
          commitHash,
          message,
          filesCommitted: stagedFiles.length,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to commit changes: ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};
