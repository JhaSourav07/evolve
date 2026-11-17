import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ModelProvider, VerificationResult } from '@evolve/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockModelProvider } from '../providers/mock.js';
import { VerificationEngine } from '../verification/engine.js';
import { computeFilesSnapshot, DebuggingEngine } from './engine.js';

describe('DebuggingEngine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-debugging-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('computeFilesSnapshot', () => {
    it('produces identical hashes for identical file contents', () => {
      const file1 = path.join(tmpDir, 'a.txt');
      fs.writeFileSync(file1, 'hello', 'utf-8');

      const h1 = computeFilesSnapshot(tmpDir, ['a.txt']);
      const h2 = computeFilesSnapshot(tmpDir, ['a.txt']);
      expect(h1).toBe(h2);
    });

    it('produces different hashes when content changes', () => {
      const file1 = path.join(tmpDir, 'a.txt');
      fs.writeFileSync(file1, 'hello', 'utf-8');
      const h1 = computeFilesSnapshot(tmpDir, ['a.txt']);

      fs.writeFileSync(file1, 'hello world', 'utf-8');
      const h2 = computeFilesSnapshot(tmpDir, ['a.txt']);
      expect(h1).not.toBe(h2);
    });
  });

  describe('DebuggingEngine recovery flow', () => {
    it('recovers when verification succeeds on attempt 1', async () => {
      const mockProvider = new MockModelProvider();
      mockProvider.enqueueResponse({
        content: 'Fixed the issue by adjusting assertion.',
        finishReason: 'stop',
      });

      const verificationEngine = new VerificationEngine();
      vi.spyOn(verificationEngine, 'verify').mockResolvedValueOnce({
        passed: true,
        totalDurationMs: 100,
        results: [],
      });

      const debugEngine = new DebuggingEngine({
        provider: mockProvider,
        verificationEngine,
        maxAttempts: 3,
      });

      const failedResult: VerificationResult = {
        stage: 'test',
        command: 'pnpm test',
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'AssertionError: expected 1 to be 2',
        durationMs: 50,
        errorTrace: 'AssertionError: expected 1 to be 2',
      };

      const result = await debugEngine.attemptRecovery({
        taskTitle: 'Fix math test',
        taskObjective: 'Ensure add(1, 1) returns 2',
        workspaceRoot: tmpDir,
        failedResult,
      });

      expect(result.recovered).toBe(true);
      expect(result.totalAttempts).toBe(1);
      expect(result.attempts.length).toBe(1);
    });

    it('detects cyclic edits and halts early', async () => {
      const mockProvider = new MockModelProvider();
      mockProvider.enqueueResponse({
        content: 'Edit 1',
        finishReason: 'stop',
      });
      mockProvider.enqueueResponse({
        content: 'Edit 2 (reverting back)',
        finishReason: 'stop',
      });

      const testFile = path.join(tmpDir, 'calc.ts');
      fs.writeFileSync(testFile, 'export const x = 1;', 'utf-8');

      const verificationEngine = new VerificationEngine();
      vi.spyOn(verificationEngine, 'verify').mockResolvedValue({
        passed: false,
        totalDurationMs: 50,
        results: [],
        failedStage: {
          stage: 'test',
          command: 'pnpm test',
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: 'Failing',
          durationMs: 50,
        },
      });

      const debugEngine = new DebuggingEngine({
        provider: mockProvider,
        verificationEngine,
        maxAttempts: 3,
      });

      const failedResult: VerificationResult = {
        stage: 'test',
        command: 'pnpm test',
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'Still failing',
        durationMs: 50,
      };

      const result = await debugEngine.attemptRecovery({
        taskTitle: 'Refactor calc',
        taskObjective: 'Pass tests',
        workspaceRoot: tmpDir,
        failedResult,
        relevantFiles: ['calc.ts'],
      });

      // Because calc.ts was not changed by mock provider, attempt 2 detects identical snapshot
      expect(result.recovered).toBe(false);
      expect(result.cycleDetected).toBe(true);
      expect(result.finalError).toContain('Cyclic edits detected');
    });
  });
});

