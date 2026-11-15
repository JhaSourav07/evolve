import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { initDatabase, resetTestDatabase } from './connection.js';
import { ProjectRepository } from './repositories/project.js';
import { SessionRepository } from './repositories/session.js';
import { ToolCallRepository } from './repositories/tool_call.js';
import { FeedbackService } from './feedback/service.js';

describe('FeedbackService', () => {
  let tmpDir: string;
  let closeDb: () => void;
  let service: FeedbackService;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let toolCallRepo: ToolCallRepository;
  let projectId: string;
  let sessionId: string;
  let toolCallId: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-feedback-test-'));
    const { db, sqlite, close } = initDatabase({ path: path.join(tmpDir, 'test.db') });
    closeDb = close;
    resetTestDatabase(sqlite);

    projectRepo = new ProjectRepository(db);
    sessionRepo = new SessionRepository(db);
    toolCallRepo = new ToolCallRepository(db);
    service = new FeedbackService(db);

    const project = projectRepo.create({
      id: 'proj_1',
      name: 'Evolve Project',
      path: tmpDir,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    projectId = project.id;

    const session = sessionRepo.create({
      id: 'sess_1',
      projectId,
      goal: 'Implement feedback and memory',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    sessionId = session.id;

    const tc = toolCallRepo.recordCall({
      id: 'call_1',
      sessionId,
      toolName: 'write_file',
      arguments: JSON.stringify({ path: 'src/main.ts', content: 'console.log("hello");' }),
      status: 'success',
      createdAt: Date.now(),
    });
    toolCallId = tc.id;
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('records action-level feedback referencing a specific toolCallId', () => {
    const fb = service.record({
      sessionId,
      targetType: 'action',
      toolCallId,
      rating: 'positive',
      notes: 'Good clean file write',
      isTechnicallyCorrect: true,
    });

    expect(fb.id).toBeDefined();
    expect(fb.targetType).toBe('action');
    expect(fb.toolCallId).toBe(toolCallId);
    expect(fb.rating).toBe(1);
    expect(fb.isTechnicallyCorrect).toBe(true);

    const list = service.listByToolCall(toolCallId);
    expect(list.length).toBe(1);
    expect(list[0]?.id).toBe(fb.id);
  });

  it('records response-level feedback with positive, negative, and partial ratings', () => {
    const fbPositive = service.record({
      sessionId,
      targetType: 'response',
      rating: 'positive',
      notes: 'Solved the problem completely',
    });
    expect(fbPositive.rating).toBe(1);

    const fbPartial = service.record({
      sessionId,
      targetType: 'response',
      rating: 'partial',
      notes: 'Partially solved but missed edge case',
    });
    expect(fbPartial.rating).toBe(0);

    const fbNegative = service.record({
      sessionId,
      targetType: 'response',
      rating: 'negative',
      notes: 'Did not solve the task',
    });
    expect(fbNegative.rating).toBe(-1);

    const all = service.listBySession(sessionId);
    expect(all.length).toBe(3);
  });

  it('records written user corrections', () => {
    const correction = 'export const VERSION = "2.0.0"; // corrected version string';
    const fb = service.record({
      sessionId,
      targetType: 'response',
      rating: 'negative',
      notes: 'Version was incorrect',
      correction,
      isTechnicallyCorrect: false,
    });

    expect(fb.correction).toBe(correction);
    expect(fb.isTechnicallyCorrect).toBe(false);

    const found = service.findById(fb.id);
    expect(found?.correction).toBe(correction);
  });

  it('rejects action-level feedback missing toolCallId', () => {
    expect(() => {
      service.record({
        sessionId,
        targetType: 'action',
        rating: 'positive',
      });
    }).toThrow(/must reference a specific toolCallId/);
  });

  describe('Conversion to Training Examples', () => {
    it('ensures a positive rating does NOT automatically imply technical correctness', () => {
      // User gave positive rating ("friendly tone!"), but code was NOT verified technically correct
      const fb = service.record({
        sessionId,
        targetType: 'response',
        rating: 'positive',
        isTechnicallyCorrect: false, // NOT technically verified
      });

      const example = service.convertToTrainingExample(fb.id);
      // isSuccessful MUST be 0 because technical correctness is false
      expect(example.isSuccessful).toBe(0);
      expect(example.critique).toContain('unverified');
    });

    it('marks training example successful when both rating is positive AND isTechnicallyCorrect is true', () => {
      const fb = service.record({
        sessionId,
        targetType: 'response',
        rating: 'positive',
        isTechnicallyCorrect: true, // Verified!
      });

      const example = service.convertToTrainingExample(fb.id);
      expect(example.isSuccessful).toBe(1);
      expect(example.critique).toContain('Verified technically correct');
    });

    it('uses written correction as the response for training examples', () => {
      const writtenCorrection = 'function add(a: number, b: number): number { return a + b; }';
      const fb = service.record({
        sessionId,
        targetType: 'response',
        rating: 'partial',
        notes: 'Used bad type signature, here is the corrected implementation',
        correction: writtenCorrection,
        isTechnicallyCorrect: true,
      });

      const example = service.convertToTrainingExample(fb.id);
      expect(example.response).toBe(writtenCorrection);
    });
  });
});
