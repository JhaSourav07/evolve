import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Plan, PlanExecutionResult } from '@evolve/core';
import { initDatabase, MemoryService, ProjectRepository, resetTestDatabase } from '@evolve/db';
import { MemoryConsolidator } from './consolidator.js';
import { MemoryExtractor } from './extractor.js';

describe('MemoryExtractor - Automatic Execution Memory Extraction', () => {
  let tmpDir: string;
  let closeDb: () => void;
  let memoryService: MemoryService;
  let projectRepo: ProjectRepository;
  let consolidator: MemoryConsolidator;
  let extractor: MemoryExtractor;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-extractor-test-'));
    const { db, sqlite, close } = initDatabase({ path: path.join(tmpDir, 'test.db') });
    closeDb = close;
    resetTestDatabase(sqlite);
    projectRepo = new ProjectRepository(db);
    memoryService = new MemoryService(db, sqlite);
    consolidator = new MemoryConsolidator(memoryService);
    extractor = new MemoryExtractor(consolidator);

    projectRepo.create({
      id: 'proj_test',
      name: 'Test Project',
      path: path.join(tmpDir, 'test'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('extracts verified solutions from completed plan tasks with verification evidence', () => {
    const mockPlan: Plan = {
      id: 'plan_123',
      projectId: 'proj_test',
      title: 'Implement JWT Auth',
      summary: 'Add JWT auth middleware',
      status: 'approved',
      tasks: [
        {
          id: 'task_1',
          planId: 'plan_123',
          title: 'Create Auth Middleware',
          description: 'Add verifyToken helper using jsonwebtoken library',
          objective: 'Add JWT verifyToken middleware',
          status: 'completed',
          dependencies: [],
          orderIndex: 0,
          relevantFiles: ['src/auth/jwt.ts'],
          expectedChanges: ['Create src/auth/jwt.ts'],
          verificationSteps: ['pnpm test src/auth/jwt.test.ts'],
          estimatedComplexity: 'low',
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const mockResult: PlanExecutionResult = {
      planId: 'plan_123',
      sessionId: 'sess_abc',
      status: 'completed',
      durationMs: 1200,
      tasksCompleted: 1,
      tasksFailed: 0,
      tasks: [
        {
          taskId: 'task_1',
          status: 'completed',
          durationMs: 800,
          filesModified: ['src/auth/jwt.ts'],
          verifications: [
            {
              stage: 'test',
              command: 'pnpm test src/auth/jwt.test.ts',
              success: true,
              exitCode: 0,
              stdout: '1 passed',
              stderr: '',
              durationMs: 300,
            },
          ],
        },
      ],
    };

    const candidates = extractor.extractFromExecution(mockPlan, mockResult);
    expect(candidates.length).toBe(1);

    const cand = candidates[0];
    expect(cand?.category).toBe('experience');
    expect(cand?.sourceType).toBe('verified_execution');
    expect(cand?.verificationStatus).toBe('verified');
    expect(cand?.content).toContain('Task "Create Auth Middleware" completed successfully');
    expect(cand?.content).toContain('src/auth/jwt.ts');
    expect(cand?.evidence).toBeDefined();

    // Consolidate into DB
    const saved = extractor.consolidateAll(candidates);
    expect(saved.length).toBe(1);
    expect(saved[0]?.verificationStatus).toBe('verified');

    const retrieved = memoryService.findById(saved[0]!.id);
    expect(retrieved?.category).toBe('experience');
  });

  it('extracts failed attempt memories with postmortem warnings', () => {
    const mockPlan: Plan = {
      id: 'plan_456',
      projectId: 'proj_test',
      title: 'Migrate DB to SQLite',
      summary: 'Migration',
      status: 'approved',
      tasks: [
        {
          id: 'task_db',
          planId: 'plan_456',
          title: 'Run Drizzle Migration',
          description: 'Run drizzle-kit migrate directly on production DB',
          objective: 'Run DB migration',
          status: 'failed',
          dependencies: [],
          orderIndex: 0,
          relevantFiles: ['drizzle.config.ts'],
          expectedChanges: ['Update DB'],
          verificationSteps: ['drizzle-kit migrate'],
          estimatedComplexity: 'medium',
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const mockResult: PlanExecutionResult = {
      planId: 'plan_456',
      sessionId: 'sess_xyz',
      status: 'failed',
      durationMs: 900,
      tasksCompleted: 0,
      tasksFailed: 1,
      tasks: [
        {
          taskId: 'task_db',
          status: 'failed',
          durationMs: 400,
          filesModified: ['drizzle.config.ts'],
          verifications: [],
          error: 'SQLITE_BUSY: database is locked',
        },
      ],
    };

    const candidates = extractor.extractFromExecution(mockPlan, mockResult);
    expect(candidates.length).toBe(1);

    const cand = candidates[0];
    expect(cand?.category).toBe('failed_attempt');
    expect(cand?.sourceType).toBe('failed_execution');
    expect(cand?.content).toContain('SQLITE_BUSY: database is locked');
    expect(cand?.content).toContain('Do not repeat without addressing root cause');

    const saved = extractor.consolidateAll(candidates);
    expect(saved.length).toBe(1);
    expect(saved[0]?.category).toBe('failed_attempt');
  });

  it('extracts explicit user preferences from natural-language instructions', () => {
    const candidate1 = extractor.extractFromUserInstruction(
      'Always use pnpm workspace commands in this repo, never run npm install.',
    );
    expect(candidate1).not.toBeNull();
    expect(candidate1?.category).toBe('user_preference');
    expect(candidate1?.sourceType).toBe('explicit_user');
    expect(candidate1?.key).toBe('tooling.package_manager');

    const candidate2 = extractor.extractFromUserInstruction(
      'I prefer Vitest over Jest for all unit tests',
    );
    expect(candidate2).not.toBeNull();
    expect(candidate2?.key).toBe('testing.preference');

    // Casual chat that does not express a preference
    const nonPref = extractor.extractFromUserInstruction('Can you explain what React hooks do?');
    expect(nonPref).toBeNull();
  });

  it('extracts proposed architecture decisions from repo inspection', () => {
    const candidates = extractor.extractFromArchitecture(
      {
        architecture: 'Modular TypeScript monorepo with pnpm workspaces',
        database: 'SQLite using Drizzle ORM in WAL mode',
        frameworks: ['Express', 'Vitest', 'Drizzle'],
      },
      'proj_test',
    );

    expect(candidates.length).toBe(3);
    expect(candidates.map((c) => c.category)).toContain('architecture_decision');
    expect(candidates.map((c) => c.category)).toContain('project_rule');
    expect(candidates.every((c) => c.verificationStatus === 'proposed')).toBe(true);
  });
});
