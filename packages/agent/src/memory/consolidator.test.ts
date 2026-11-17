import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDatabase, MemoryService, ProjectRepository, resetTestDatabase } from '@evolve/db';
import { MemoryConsolidator } from './consolidator.js';

describe('MemoryConsolidator - Quality & Conflict Resolution', () => {
  let tmpDir: string;
  let closeDb: () => void;
  let memoryService: MemoryService;
  let projectRepo: ProjectRepository;
  let consolidator: MemoryConsolidator;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-consolidator-test-'));
    const { db, sqlite, close } = initDatabase({ path: path.join(tmpDir, 'test.db') });
    closeDb = close;
    resetTestDatabase(sqlite);
    projectRepo = new ProjectRepository(db);
    memoryService = new MemoryService(db, sqlite);
    consolidator = new MemoryConsolidator(memoryService);

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

  it('detects near-identical duplicates and resolves to keep_existing', () => {
    memoryService.savePreference(
      'style.quotes',
      'Always use single quotes across all TypeScript files',
    );

    const analysis = consolidator.analyzeConflict({
      category: 'user_preference',
      key: 'style.quotes',
      content: 'Always use single quotes across all TypeScript source files',
      sourceType: 'explicit_user',
      confidence: 1.0,
      verificationStatus: 'verified',
    });

    expect(analysis.hasConflict).toBe(false);
    expect(analysis.resolution).toBe('keep_existing');
  });

  it('allows explicit user instructions to supersede existing automated memories', () => {
    // 1. Existing memory from repo inspection
    const oldMem = memoryService.saveMemory(
      'project_rule',
      'test.framework',
      'Project uses Jest for running unit tests',
      {
        projectId: 'proj_test',
        sourceType: 'repo_inspection',
        verificationStatus: 'verified',
      },
    );

    // 2. User explicitly changes preference to Vitest
    const analysis = consolidator.analyzeConflict({
      category: 'project_rule',
      key: 'test.framework',
      content: 'Migrated to Vitest for all unit testing',
      projectId: 'proj_test',
      sourceType: 'explicit_user',
      confidence: 1.0,
      verificationStatus: 'verified',
    });

    expect(analysis.hasConflict).toBe(true);
    expect(analysis.resolution).toBe('supersede');
    expect(analysis.conflictingMemoryId).toBe(oldMem.id);

    // 3. Consolidate
    const newMem = consolidator.consolidate({
      category: 'project_rule',
      key: 'test.framework',
      content: 'Migrated to Vitest for all unit testing',
      projectId: 'proj_test',
      sourceType: 'explicit_user',
      confidence: 1.0,
      verificationStatus: 'verified',
    });

    expect(newMem.content).toBe('Migrated to Vitest for all unit testing');
    expect(newMem.sourceType).toBe('explicit_user');

    // 4. Check old memory is now deprecated
    const oldChecked = memoryService.findById(oldMem.id);
    expect(oldChecked?.verificationStatus).toBe('deprecated');
  });

  it('prevents low-priority automated inspections from overwriting explicit user preferences', () => {
    memoryService.saveMemory(
      'user_preference',
      'style.semicolons',
      'Never omit semicolons; always enforce semicolons.',
      {
        sourceType: 'explicit_user',
        verificationStatus: 'verified',
      },
    );

    const analysis = consolidator.analyzeConflict({
      category: 'user_preference',
      key: 'style.semicolons',
      content: 'Omit semicolons everywhere.',
      sourceType: 'repo_inspection',
      confidence: 0.6,
      verificationStatus: 'proposed',
    });

    expect(analysis.hasConflict).toBe(true);
    expect(analysis.resolution).toBe('reject_candidate');
  });

  it('sanitizes secrets when consolidating candidate memories', () => {
    const mem = consolidator.consolidate({
      category: 'user_preference',
      key: 'auth.api_key',
      content: 'Use OpenAI key sk-1234567890abcdef1234567890abcdef1234567890 in tests',
      sourceType: 'explicit_user',
      confidence: 1.0,
      verificationStatus: 'verified',
    });

    expect(mem.content).toContain('[REDACTED_API_KEY]');
    expect(mem.content).not.toContain('sk-1234567890abcdef');
  });
});

