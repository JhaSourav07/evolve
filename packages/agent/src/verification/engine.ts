import fs from 'node:fs';
import path from 'node:path';
import type { VerificationResult, VerificationStage } from '@evolve/core';
import { execProcess } from '../tools/execution.js';
import { scrubSecrets } from '../tools/security.js';

export interface VerificationOptions {
  stages?: VerificationStage[] | undefined;
  stopOnFirstFailure?: boolean | undefined;
  customTestCommand?: string | undefined;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface VerificationReport {
  passed: boolean;
  totalDurationMs: number;
  results: VerificationResult[];
  failedStage?: VerificationResult | undefined;
}

export interface DetectedStage {
  stage: VerificationStage;
  command: string;
}

/**
 * Extracts decisive error trace lines from stdout and stderr.
 */
export function extractErrorTrace(stdout: string, stderr: string): string {
  const combined = (stderr + '\n' + stdout).trim();
  if (!combined) return '';

  const lines = combined.split('\n');
  const errorIndices: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? '';
    if (
      /\b(?:error|fail|failed|failure|fatal|exception|assertionerror|typeerror|syntaxerror|ts\d+)\b/i.test(l) ||
      /^\s*at\s+/.test(l) ||
      l.startsWith('FAIL') ||
      l.startsWith('ERR!')
    ) {
      errorIndices.push(i);
    }
  }

  if (errorIndices.length === 0) {
    // Return last 20 lines
    return lines.slice(-20).join('\n');
  }

  // Extract window around error occurrences
  const firstIdx = Math.max(0, (errorIndices[0] ?? 0) - 2);
  const lastIdx = Math.min(lines.length, (errorIndices[errorIndices.length - 1] ?? 0) + 10);

  return lines.slice(firstIdx, Math.min(firstIdx + 30, lastIdx)).join('\n');
}

/**
 * Detects package manager used in the workspace.
 */
export function detectPackageManager(workspaceRoot: string): 'pnpm' | 'yarn' | 'bun' | 'npm' {
  if (fs.existsSync(path.join(workspaceRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(workspaceRoot, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(workspaceRoot, 'bun.lockb')) || fs.existsSync(path.join(workspaceRoot, 'bun.lock'))) {
    return 'bun';
  }
  return 'npm';
}

/**
 * Auto-detects available verification stages and corresponding commands.
 */
export function detectVerificationStages(
  workspaceRoot: string,
  options?: { customTestCommand?: string | undefined },
): DetectedStage[] {
  const stages: DetectedStage[] = [];
  const pkgJsonPath = path.join(workspaceRoot, 'package.json');
  const cargoPath = path.join(workspaceRoot, 'Cargo.toml');
  const pyprojectPath = path.join(workspaceRoot, 'pyproject.toml');

  // Node.js / JavaScript / TypeScript detection
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      const scripts = pkg.scripts || {};
      const pm = detectPackageManager(workspaceRoot);
      const runner = pm === 'npm' ? 'npm run' : pm;

      // 1. Typecheck stage
      if (scripts.typecheck) {
        stages.push({ stage: 'typecheck', command: `${runner} typecheck` });
      } else if (scripts['check-types']) {
        stages.push({ stage: 'typecheck', command: `${runner} check-types` });
      } else if (fs.existsSync(path.join(workspaceRoot, 'tsconfig.json'))) {
        stages.push({ stage: 'typecheck', command: 'npx tsc --noEmit' });
      }

      // 2. Lint stage
      if (scripts.lint) {
        stages.push({ stage: 'lint', command: `${runner} lint` });
      }

      // 3. Test stage
      if (options?.customTestCommand) {
        stages.push({ stage: 'test', command: options.customTestCommand });
      } else if (scripts.test && !scripts.test.includes('no test specified')) {
        stages.push({ stage: 'test', command: `${runner} test` });
      }

      // 4. Build stage
      if (scripts.build) {
        stages.push({ stage: 'build', command: `${runner} build` });
      }

      return stages;
    } catch {
      // Fallback
    }
  }

  // Rust detection
  if (fs.existsSync(cargoPath)) {
    stages.push({ stage: 'typecheck', command: 'cargo check' });
    if (options?.customTestCommand) {
      stages.push({ stage: 'test', command: options.customTestCommand });
    } else {
      stages.push({ stage: 'test', command: 'cargo test' });
    }
    stages.push({ stage: 'build', command: 'cargo build' });
    return stages;
  }

  // Python detection
  if (fs.existsSync(pyprojectPath) || fs.existsSync(path.join(workspaceRoot, 'pytest.ini'))) {
    if (options?.customTestCommand) {
      stages.push({ stage: 'test', command: options.customTestCommand });
    } else {
      stages.push({ stage: 'test', command: 'pytest' });
    }
    return stages;
  }

  // Custom test command if provided
  if (options?.customTestCommand) {
    stages.push({ stage: 'test', command: options.customTestCommand });
  }

  return stages;
}

export class VerificationEngine {
  /**
   * Executes a single verification stage and captures its result.
   */
  public async runStage(
    stage: VerificationStage,
    command: string,
    workspaceRoot: string,
    options?: { timeoutMs?: number | undefined; signal?: AbortSignal | undefined },
  ): Promise<VerificationResult> {
    const timeoutMs = options?.timeoutMs ?? 60_000;
    const res = await execProcess({
      command,
      cwd: workspaceRoot,
      timeoutMs,
      maxOutputBytes: 100_000,
      signal: options?.signal,
    });

    const stdout = scrubSecrets(res.stdout);
    const stderr = scrubSecrets(res.stderr);
    const success = res.exitCode === 0 && !res.timedOut;

    let errorTrace: string | undefined;
    if (!success) {
      errorTrace = extractErrorTrace(stdout, stderr);
    }

    return {
      stage,
      command,
      success,
      exitCode: res.exitCode,
      stdout,
      stderr,
      durationMs: res.durationMs,
      ...(errorTrace ? { errorTrace } : {}),
    };
  }

  /**
   * Runs all detected or specified verification stages sequentially.
   */
  public async verify(
    workspaceRoot: string,
    options: VerificationOptions = {},
  ): Promise<VerificationReport> {
    const startTime = Date.now();
    const detectedStages = detectVerificationStages(workspaceRoot, {
      customTestCommand: options.customTestCommand,
    });

    const targetStages = options.stages
      ? detectedStages.filter((s) => options.stages!.includes(s.stage))
      : detectedStages;

    const results: VerificationResult[] = [];
    let failedStage: VerificationResult | undefined;
    const stopOnFirstFailure = options.stopOnFirstFailure ?? true;

    for (const { stage, command } of targetStages) {
      const result = await this.runStage(stage, command, workspaceRoot, {
        timeoutMs: options.timeoutMs,
        signal: options.signal,
      });

      results.push(result);

      if (!result.success) {
        failedStage = result;
        if (stopOnFirstFailure) {
          break;
        }
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const passed = results.length > 0 ? results.every((r) => r.success) : true;

    return {
      passed,
      totalDurationMs,
      results,
      ...(failedStage ? { failedStage } : {}),
    };
  }
}
