import { execFile } from 'node:child_process';
import type { AgentTool } from '@evolve/core';
import { z } from 'zod';
import { assertSafePath } from './security.js';

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
