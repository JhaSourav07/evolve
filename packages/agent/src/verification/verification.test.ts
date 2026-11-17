import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectPackageManager,
  detectVerificationStages,
  extractErrorTrace,
  VerificationEngine,
} from './engine.js';

describe('VerificationEngine & Utilities', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-verification-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('detectPackageManager', () => {
    it('detects pnpm when pnpm-lock.yaml is present', () => {
      fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
      expect(detectPackageManager(tmpDir)).toBe('pnpm');
    });

    it('detects yarn when yarn.lock is present', () => {
      fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '');
      expect(detectPackageManager(tmpDir)).toBe('yarn');
    });

    it('defaults to npm when no lockfile exists', () => {
      expect(detectPackageManager(tmpDir)).toBe('npm');
    });
  });

  describe('detectVerificationStages', () => {
    it('detects package.json scripts correctly', () => {
      fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          scripts: {
            typecheck: 'tsc --noEmit',
            lint: 'eslint .',
            test: 'vitest run',
            build: 'tsc -b',
          },
        }),
      );

      const stages = detectVerificationStages(tmpDir);
      expect(stages.length).toBe(4);
      expect(stages.map((s) => s.stage)).toEqual(['typecheck', 'lint', 'test', 'build']);
      expect(stages[0]?.command).toBe('pnpm typecheck');
      expect(stages[1]?.command).toBe('pnpm lint');
      expect(stages[2]?.command).toBe('pnpm test');
      expect(stages[3]?.command).toBe('pnpm build');
    });

    it('detects tsconfig.json fallback for typecheck', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          scripts: {
            test: 'vitest',
          },
        }),
      );
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');

      const stages = detectVerificationStages(tmpDir);
      expect(stages.find((s) => s.stage === 'typecheck')?.command).toBe('npx tsc --noEmit');
    });

    it('uses customTestCommand override when provided', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          scripts: {
            test: 'echo default test',
          },
        }),
      );

      const stages = detectVerificationStages(tmpDir, { customTestCommand: 'pnpm test:unit' });
      expect(stages.find((s) => s.stage === 'test')?.command).toBe('pnpm test:unit');
    });
  });

  describe('extractErrorTrace', () => {
    it('identifies and extracts relevant error lines', () => {
      const stdout = [
        'Starting test runner...',
        'Compiling files...',
        'FAIL src/auth.test.ts',
        '  ● Auth > should verify valid JWT token',
        '    AssertionError: expected false to be true',
        '      at Object.<anonymous> (src/auth.test.ts:42:15)',
        'Tests: 1 failed, 10 passed',
      ].join('\n');

      const trace = extractErrorTrace(stdout, '');
      expect(trace).toContain('FAIL src/auth.test.ts');
      expect(trace).toContain('AssertionError: expected false to be true');
    });
  });

  describe('VerificationEngine execution', () => {
    it('runs verification stage and captures exitCode and output', async () => {
      const engine = new VerificationEngine();
      const res = await engine.runStage('typecheck', 'echo "Types are clean"', tmpDir);

      expect(res.success).toBe(true);
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Types are clean');
      expect(res.stage).toBe('typecheck');
    });

    it('stops on first failure when stopOnFirstFailure is enabled', async () => {
      fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          scripts: {
            typecheck: 'exit 1', // will fail
            test: 'echo "should not run"',
          },
        }),
      );

      const engine = new VerificationEngine();
      const report = await engine.verify(tmpDir, { stopOnFirstFailure: true });

      expect(report.passed).toBe(false);
      expect(report.results.length).toBe(1);
      expect(report.results[0]?.stage).toBe('typecheck');
      expect(report.results[0]?.success).toBe(false);
      expect(report.failedStage?.stage).toBe('typecheck');
    });
  });
});
