import { describe, expect, it } from 'vitest';
import { initDatabase, resetTestDatabase } from './connection.js';
import { ProjectRepository } from './repositories/project.js';
import { SessionRepository } from './repositories/session.js';

describe('Database Connection & Pragma Enforcement', () => {
  it('enforces foreign key constraints', () => {
    const { db, _sqlite, close } = initDatabase({ path: ':memory:' });

    try {
      const sessionRepo = new SessionRepository(db);

      // Attempting to insert a session referencing a non-existent project MUST fail
      expect(() => {
        sessionRepo.create({
          id: 'sess_123',
          projectId: 'proj_non_existent',
          goal: 'Test foreign keys',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }).toThrow(/FOREIGN KEY/i);
    } finally {
      close();
    }
  });

  it('resets database tables cleanly in test environments', () => {
    const { db, sqlite, close } = initDatabase({ path: ':memory:' });

    try {
      const projectRepo = new ProjectRepository(db);
      projectRepo.create({
        id: 'proj_test',
        name: 'Test Project',
        path: '/tmp/test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      expect(projectRepo.list()).toHaveLength(1);

      // Reset
      resetTestDatabase(sqlite);

      expect(projectRepo.list()).toHaveLength(0);
    } finally {
      close();
    }
  });
});
