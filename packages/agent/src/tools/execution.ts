import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AgentTool } from '@evolve/core';
import { z } from 'zod';
import { assertSafePath, checkApproval } from './security.js';

export interface ExecProcessOptions {
  command: string;
  cwd: string;
  timeoutMs?: number | undefined;
  maxOutputBytes?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface ExecProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

/**
 * Executes a process safely with output capping, timeouts, and signal cancellation.
 */
export async function execProcess(options: ExecProcessOptions): Promise<ExecProcessResult> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxBytes = options.maxOutputBytes ?? 50_000;
  const startTime = Date.now();

  return new Promise<ExecProcessResult>((resolve) => {
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let isDone = false;
    let timedOut = false;

    // Use /bin/sh on POSIX or cmd.exe on Windows
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/d', '/s', '/c', options.command] : ['-c', options.command];

    const child = spawn(shell, shellArgs, {
      cwd: options.cwd,
      env: {
        ...process.env,
        CI: 'true', // prevent interactive prompts from hanging
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Close stdin immediately to prevent processes waiting for input
    child.stdin.end();

    // Timeout enforcement
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
        // Force kill after grace period
        setTimeout(() => {
          try {
            if (!isDone) child.kill('SIGKILL');
          } catch {
            // Process may already be dead
          }
        }, 1000);
      } catch {
        // Child already exited
      }
    }, timeoutMs);

    const finish = (exitCode: number) => {
      if (isDone) return;
      isDone = true;
      clearTimeout(timer);

      const durationMs = Date.now() - startTime;
      resolve({
        exitCode,
        stdout: stdoutBuffer,
        stderr: stderrBuffer,
        durationMs,
        timedOut,
      });
    };

    // Cancellation signal enforcement
    if (options.signal) {
      if (options.signal.aborted) {
        child.kill('SIGKILL');
        finish(130); // 130 = terminated by Ctrl+C
        return;
      }
      options.signal.addEventListener('abort', () => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
        finish(130);
      });
    }

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdoutBuffer.length < maxBytes) {
        stdoutBuffer += chunk.toString('utf-8');
        if (stdoutBuffer.length > maxBytes) {
          stdoutBuffer =
            stdoutBuffer.slice(0, maxBytes) +
            `\n[Warning: stdout truncated at ${maxBytes} characters]`;
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBuffer.length < maxBytes) {
        stderrBuffer += chunk.toString('utf-8');
        if (stderrBuffer.length > maxBytes) {
          stderrBuffer =
            stderrBuffer.slice(0, maxBytes) +
            `\n[Warning: stderr truncated at ${maxBytes} characters]`;
        }
      }
    });

    child.on('error', (err) => {
      stderrBuffer += `\nFailed to start subprocess: ${err.message}`;
      finish(1);
    });

    child.on('close', (code) => {
      finish(code ?? (timedOut ? 124 : 0));
    });
  });
}

export const runCommandTool: AgentTool<
  {
    command: string;
    cwd?: string | undefined;
    timeoutMs?: number | undefined;
    maxOutputBytes?: number | undefined;
  },
  ExecProcessResult
> = {
  definition: {
    name: 'run_command',
    description:
      'Executes a shell command inside the workspace directory. Requires approval, enforces timeouts, and caps output length.',
    parameters: z.object({
      command: z.string().min(1).describe('Shell command to execute'),
      cwd: z
        .string()
        .optional()
        .describe(
          'Relative directory inside workspace to run the command in (defaults to workspace root)',
        ),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Timeout in milliseconds (default 30,000)'),
      maxOutputBytes: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum bytes of stdout/stderr to capture (default 50,000)'),
    }),
  },
  async execute({ command, cwd, timeoutMs, maxOutputBytes }, context) {
    try {
      const workingDir = cwd ? assertSafePath(cwd, context.workspaceRoot) : context.workspaceRoot;

      const approval = await checkApproval(
        'run_command',
        `Execute shell command: '${command}'`,
        { command, cwd: workingDir },
        context,
      );

      if (!approval.approved) {
        return {
          success: false,
          output: approval.reason ?? `Execution of command '${command}' was rejected.`,
          error: 'APPROVAL_DENIED',
        };
      }

      const res = await execProcess({
        command,
        cwd: workingDir,
        timeoutMs,
        maxOutputBytes,
        signal: context.signal,
      });

      const outputLines: string[] = [];
      if (res.stdout.trim().length > 0) {
        outputLines.push(res.stdout.trim());
      }
      if (res.stderr.trim().length > 0) {
        outputLines.push(`[stderr]\n${res.stderr.trim()}`);
      }
      if (res.timedOut) {
        outputLines.push(`[Command timed out after ${timeoutMs ?? 30000}ms]`);
      }

      const combinedOutput =
        outputLines.length > 0
          ? outputLines.join('\n\n')
          : `(Command exited with code ${res.exitCode})`;

      return {
        success: res.exitCode === 0,
        output: combinedOutput,
        data: res,
        ...(res.exitCode !== 0 ? { error: `Exit code ${res.exitCode}` } : {}),
      };
    } catch (err) {
      return {
        success: false,
        output: `Command execution exception: ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};

export const runTestsTool: AgentTool<
  { testCommand?: string | undefined; path?: string | undefined; timeoutMs?: number | undefined },
  ExecProcessResult & { detectedCommand: string; passed: boolean }
> = {
  definition: {
    name: 'run_tests',
    description: 'Auto-detects and runs project unit/integration tests inside the workspace.',
    parameters: z.object({
      testCommand: z
        .string()
        .optional()
        .describe('Specific test command to run. If omitted, auto-detected from project files'),
      path: z.string().optional().describe('Specific test file or folder to test'),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Timeout in milliseconds (default 60,000)'),
    }),
  },
  async execute({ testCommand, path: targetPath, timeoutMs = 60_000 }, context) {
    try {
      let cmd = testCommand;

      // Auto-detect test runner if not specified
      if (!cmd) {
        const pkgJsonPath = path.join(context.workspaceRoot, 'package.json');
        if (fs.existsSync(pkgJsonPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as {
              scripts?: Record<string, string>;
            };
            if (pkg.scripts && 'test' in pkg.scripts) {
              cmd = targetPath ? `npm test -- ${targetPath}` : 'npm test';
            }
          } catch {
            // ignore JSON parse error
          }
        }

        if (!cmd) {
          if (
            fs.existsSync(path.join(context.workspaceRoot, 'pytest.ini')) ||
            fs.existsSync(path.join(context.workspaceRoot, 'pyproject.toml'))
          ) {
            cmd = targetPath ? `pytest ${targetPath}` : 'pytest';
          } else if (fs.existsSync(path.join(context.workspaceRoot, 'Cargo.toml'))) {
            cmd = targetPath ? `cargo test ${targetPath}` : 'cargo test';
          } else {
            cmd = 'npm test'; // standard default
          }
        }
      }

      const approval = await checkApproval(
        'run_tests',
        `Run tests: '${cmd}'`,
        { command: cmd, path: targetPath },
        context,
      );

      if (!approval.approved) {
        return {
          success: false,
          output: approval.reason ?? `Test execution was rejected.`,
          error: 'APPROVAL_DENIED',
        };
      }

      const res = await execProcess({
        command: cmd,
        cwd: context.workspaceRoot,
        timeoutMs,
        signal: context.signal,
      });

      const passed = res.exitCode === 0;
      const combined = [res.stdout.trim(), res.stderr.trim()]
        .filter((s) => s.length > 0)
        .join('\n\n');

      const summary = passed
        ? `Tests PASSED (Command: '${cmd}', ${res.durationMs}ms):\n\n${combined}`
        : `Tests FAILED (Exit Code: ${res.exitCode}, Command: '${cmd}', ${res.durationMs}ms):\n\n${combined}`;

      return {
        success: passed,
        output: summary,
        data: {
          ...res,
          detectedCommand: cmd,
          passed,
        },
        ...(!passed ? { error: `Tests failed with exit code ${res.exitCode}` } : {}),
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to run tests: ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};
