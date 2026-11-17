import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { initDatabase, resetTestDatabase } from './connection.js';
import { ProjectRepository } from './repositories/project.js';
import { MemoryService, sanitizeFtsQuery } from './memory/service.js';

describe('MemoryService & SQLite FTS5 Keyword Retrieval', () => {
  let tmpDir: string;
  let closeDb: () => void;
  let service: MemoryService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-memory-test-'));
    const { db, sqlite, close } = initDatabase({ path: path.join(tmpDir, 'test.db') });
    closeDb = close;
    resetTestDatabase(sqlite);
    service = new MemoryService(db, sqlite);

    const projectRepo = new ProjectRepository(db);
    projectRepo.create({
      id: 'proj_evolve',
      name: 'Evolve Project',
      path: tmpDir,
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

  describe('Query Sanitization', () => {
    it('sanitizes punctuation and special characters safely for FTS5', () => {
      expect(sanitizeFtsQuery('tsc -b --noEmit error')).toBe('"tsc"* OR "noEmit"* OR "error"*');
      expect(sanitizeFtsQuery('hello, world! (foo:bar)')).toBe(
        '"hello"* OR "world"* OR "foo"* OR "bar"*',
      );
      expect(sanitizeFtsQuery('   ')).toBe('');
    });
  });

  describe('User Preferences', () => {
    it('persists and retrieves user preferences', () => {
      const pref = service.savePreference(
        'tooling.package_manager',
        'Always use pnpm, never npm or yarn in this monorepo.',
        { tags: ['tooling', 'package-manager', 'pnpm'] },
      );

      expect(pref.id).toBeDefined();
      expect(pref.category).toBe('user_preference');
      expect(pref.key).toBe('tooling.package_manager');

      const all = service.listPreferences();
      expect(all.length).toBe(1);
      expect(all[0]?.content).toContain('Always use pnpm');
    });
  });

  describe('Project Memory', () => {
    it('stores project rules and architectural facts scoped to a project', () => {
      service.saveProjectRule(
        'proj_evolve',
        'architecture.database',
        'SQLite with Drizzle ORM in WAL mode with PRAGMA foreign_keys = ON.',
        { tags: ['database', 'sqlite', 'drizzle'] },
      );

      const rules = service.listProjectRules('proj_evolve');
      expect(rules.length).toBe(1);
      expect(rules[0]?.content).toContain('SQLite with Drizzle');
    });
  });

  describe('Experience Memory & SQLite FTS5 Retrieval', () => {
    it('indexes experiences and retrieves them using BM25 keyword search', () => {
      // 1. Store two distinct experiences
      service.saveExperience(
        'tsc_project_references',
        'When using tsc -b with project references, do not pass --noEmit in downstream packages.',
        { tags: ['typescript', 'tsc', 'build', 'noEmit'] },
      );

      service.saveExperience(
        'drizzle_better_sqlite',
        'better-sqlite3 is synchronous; use .get() and .all() directly without awaiting promises.',
        { tags: ['drizzle', 'sqlite', 'synchronous'] },
      );

      // 2. Search for TypeScript build issue
      const tsResults = service.search('tsc build noEmit');
      expect(tsResults.length).toBeGreaterThan(0);
      expect(tsResults[0]?.key).toBe('tsc_project_references');
      expect(tsResults[0]?.content).toContain('--noEmit');

      // 3. Search for SQLite driver issue
      const dbResults = service.search('drizzle synchronous promise');
      expect(dbResults.length).toBeGreaterThan(0);
      expect(dbResults[0]?.key).toBe('drizzle_better_sqlite');
      expect(dbResults[0]?.content).toContain('better-sqlite3 is synchronous');
    });

    it('filters FTS5 search by category and project', () => {
      service.savePreference('style.quotes', 'Use single quotes across TypeScript files.');
      service.saveExperience(
        'quote_bug',
        'Escaped quotes inside JSON string caused parse failure.',
      );

      const prefSearch = service.search('quote', { category: 'user_preference' });
      expect(prefSearch.length).toBe(1);
      expect(prefSearch[0]?.key).toBe('style.quotes');

      const expSearch = service.search('quote', { category: 'experience' });
      expect(expSearch.length).toBe(1);
      expect(expSearch[0]?.key).toBe('quote_bug');
    });

    it('deletes from both relational table and FTS5 index', () => {
      const item = service.saveExperience('temporary_note', 'Temporary debugging note to delete.');
      expect(service.search('temporary').length).toBe(1);

      service.delete(item.id);
      expect(service.search('temporary').length).toBe(0);
    });

    it('tracks provenance, verification status, and evidence', () => {
      const mem = service.saveMemory('architecture_decision', 'arch.state_mgmt', 'Use Zustand for UI state', {
        projectId: 'proj_evolve',
        sourceType: 'verified_execution',
        sourceSessionId: 'sess_123',
        verificationStatus: 'verified',
        evidence: { verifiedByTest: true, testSuite: 'ui.test.ts' },
      });

      expect(mem.sourceType).toBe('verified_execution');
      expect(mem.sourceSessionId).toBe('sess_123');
      expect(mem.verificationStatus).toBe('verified');
      expect(mem.evidenceJson).toContain('verifiedByTest');

      const found = service.findById(mem.id);
      expect(found?.verificationStatus).toBe('verified');
    });

    it('handles deprecation and excludes deprecated from default search', () => {
      const oldMem = service.savePreference('style.linter', 'Use ESLint v8');
      service.deprecate(oldMem.id, 'mem_new_linter');

      const activeSearchResults = service.search('ESLint');
      expect(activeSearchResults.length).toBe(0);

      const allSearchResults = service.search('ESLint', { includeDeprecated: true });
      expect(allSearchResults.length).toBe(1);
      expect(allSearchResults[0]?.supersededBy).toBe('mem_new_linter');
    });

    it('increments access count and tracks lastAccessedAt', () => {
      const mem = service.savePreference('perf.cache', 'Cache AST nodes in memory');
      expect(mem.accessCount).toBe(0);

      service.recordAccess(mem.id);
      const updated = service.findById(mem.id);
      expect(updated?.accessCount).toBe(1);
      expect(updated?.lastAccessedAt).toBeGreaterThan(0);
    });

    it('stores and lists architecture decisions and failed attempts', () => {
      service.saveArchitectureDecision('proj_evolve', 'dec.auth', 'Use Argon2 for password hashing');
      service.saveFailedAttempt('proj_evolve', 'failed.crypto_subtle', 'SubtleCrypto is not synchronous');

      const decisions = service.listDecisions('proj_evolve');
      expect(decisions.length).toBe(1);
      expect(decisions[0]?.key).toBe('dec.auth');

      const failed = service.listFailedAttempts('proj_evolve');
      expect(failed.length).toBe(1);
      expect(failed[0]?.key).toBe('failed.crypto_subtle');
    });
  });
});
