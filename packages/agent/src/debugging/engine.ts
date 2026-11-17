import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ModelProvider, VerificationResult } from '@evolve/core';
import { AgentRuntime } from '../runtime/agent.js';
import type { AgentRunOptions } from '../runtime/types.js';
import { ToolRegistry } from '../tools/registry.js';
import { VerificationEngine, type VerificationOptions } from '../verification/engine.js';

export interface DebugAttempt {
  attemptNumber: number;
  hypothesis: string;
  filesChanged: string[];
  verificationPassed: boolean;
  errorTrace?: string | undefined;
}

export interface DebugResult {
  recovered: boolean;
  totalAttempts: number;
  attempts: DebugAttempt[];
  finalError?: string | undefined;
  cycleDetected?: boolean | undefined;
}

export interface DebugRecoveryContext {
  taskTitle: string;
  taskObjective: string;
  workspaceRoot: string;
  failedResult: VerificationResult;
  relevantFiles?: string[] | undefined;
  signal?: AbortSignal | undefined;
  verificationOptions?: VerificationOptions | undefined;
}

export interface DebuggingEngineOptions {
  provider: ModelProvider;
  verificationEngine?: VerificationEngine | undefined;
  tools?: ToolRegistry | undefined;
  maxAttempts?: number | undefined;
}

/**
 * Computes a deterministic SHA-256 fingerprint for a set of files to detect cyclic modifications.
 */
export function computeFilesSnapshot(workspaceRoot: string, files: string[]): string {
  const hash = createHash('sha256');
  const sorted = [...files].sort();

  for (const relPath of sorted) {
    const fullPath = path.resolve(workspaceRoot, relPath);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      hash.update(relPath);
      hash.update(':');
      hash.update(fs.readFileSync(fullPath));
    } else {
      hash.update(`${relPath}:absent`);
    }
  }

  return hash.digest('hex');
}

export class DebuggingEngine {
  private readonly provider: ModelProvider;
  private readonly verificationEngine: VerificationEngine;
  private readonly tools: ToolRegistry;
  private readonly maxAttempts: number;

  constructor(options: DebuggingEngineOptions) {
    this.provider = options.provider;
    this.verificationEngine = options.verificationEngine ?? new VerificationEngine();
    this.tools = options.tools ?? new ToolRegistry().registerDefaultTools();
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  /**
   * Orchestrates the bounded iterative repair loop to fix verification failures.
   */
  public async attemptRecovery(context: DebugRecoveryContext): Promise<DebugResult> {
    const attempts: DebugAttempt[] = [];
    const seenSnapshots = new Set<string>();

    let currentFailure: VerificationResult = context.failedResult;
    const filesToTrack = context.relevantFiles && context.relevantFiles.length > 0
      ? [...context.relevantFiles]
      : [];

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      if (context.signal?.aborted) {
        return {
          recovered: false,
          totalAttempts: attempt - 1,
          attempts,
          finalError: 'Debugging aborted by cancellation signal.',
        };
      }

      // Check for cyclic edits
      if (filesToTrack.length > 0) {
        const snapshot = computeFilesSnapshot(context.workspaceRoot, filesToTrack);
        if (seenSnapshots.has(snapshot)) {
          return {
            recovered: false,
            totalAttempts: attempt - 1,
            attempts,
            cycleDetected: true,
            finalError: 'Cyclic edits detected: repository returned to a previously seen state without fixing the error.',
          };
        }
        seenSnapshots.add(snapshot);
      }

      // Construct diagnostic repair prompt
      const diagnosticPrompt = this.formatDiagnosticPrompt(context, currentFailure, attempt);

      // Create an agent runtime instance for the repair pass
      const runtime = new AgentRuntime({
        provider: this.provider,
        tools: this.tools,
        config: {
          workspaceRoot: context.workspaceRoot,
          maxContextTokens: 64_000,
          maxSteps: 8,
          systemPrompt:
            'You are Evolve autonomous software repair agent. Your objective is to analyze verification/test failures, inspect code, and perform minimal, precise repairs to get tests and builds to pass cleanly.',
        },
      });

      const runOpts: AgentRunOptions = {
        signal: context.signal,
      };

      const runResult = await runtime.run(diagnosticPrompt, runOpts);

      // Run verification after the repair attempt
      const verification = await this.verificationEngine.verify(
        context.workspaceRoot,
        context.verificationOptions ?? {},
      );

      const attemptRecord: DebugAttempt = {
        attemptNumber: attempt,
        hypothesis: runResult.finalResponse || 'Applied automated repair steps.',
        filesChanged: filesToTrack,
        verificationPassed: verification.passed,
        ...(verification.failedStage?.errorTrace ? { errorTrace: verification.failedStage.errorTrace } : {}),
      };

      attempts.push(attemptRecord);

      if (verification.passed) {
        return {
          recovered: true,
          totalAttempts: attempt,
          attempts,
        };
      }

      if (verification.failedStage) {
        currentFailure = verification.failedStage;
      }
    }

    return {
      recovered: false,
      totalAttempts: this.maxAttempts,
      attempts,
      finalError: currentFailure.errorTrace || currentFailure.stderr || 'Maximum debug attempts exceeded.',
    };
  }

  private formatDiagnosticPrompt(
    context: DebugRecoveryContext,
    failure: VerificationResult,
    attempt: number,
  ): string {
    const errorSnippet = failure.errorTrace || failure.stderr || failure.stdout || '(no output)';
    return [
      `[DEBUG RECOVERY ATTEMPT ${attempt} OF ${this.maxAttempts}]`,
      `Task: ${context.taskTitle}`,
      `Objective: ${context.taskObjective}`,
      `Failed Stage: ${failure.stage} (command: ${failure.command}, exit code: ${failure.exitCode})`,
      '',
      'Diagnostic Error Trace:',
      errorSnippet,
      '',
      'Instructions:',
      '1. Read the error trace carefully to identify the failing file and line number.',
      '2. Inspect the relevant files using read_file.',
      '3. Apply the minimal necessary fix using edit_file or write_file.',
      '4. Explain the root cause and the fix applied.',
    ].join('\n');
  }
}
