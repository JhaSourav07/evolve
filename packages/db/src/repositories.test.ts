import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDatabase, type EvolveDatabaseInstance } from './connection.js';
import {
  EventRepository,
  FeedbackRepository,
  KnowledgeRepository,
  ModelVersionRepository,
  ProjectRepository,
  SessionRepository,
  ToolCallRepository,
  TrainingRepository,
} from './repositories/index.js';

describe('Repository Integration Tests', () => {
  let instance: EvolveDatabaseInstance;
  let projectRepo: ProjectRepository;
  let sessionRepo: SessionRepository;
  let eventRepo: EventRepository;
  let toolCallRepo: ToolCallRepository;
  let feedbackRepo: FeedbackRepository;
  let knowledgeRepo: KnowledgeRepository;
  let trainingRepo: TrainingRepository;
  let modelRepo: ModelVersionRepository;

  beforeEach(() => {
    instance = initDatabase({ path: ':memory:' });
    projectRepo = new ProjectRepository(instance.db);
    sessionRepo = new SessionRepository(instance.db);
    eventRepo = new EventRepository(instance.db);
    toolCallRepo = new ToolCallRepository(instance.db);
    feedbackRepo = new FeedbackRepository(instance.db);
    knowledgeRepo = new KnowledgeRepository(instance.db);
    trainingRepo = new TrainingRepository(instance.db);
    modelRepo = new ModelVersionRepository(instance.db);
  });

  afterEach(() => {
    instance.close();
  });

  it('manages projects lifecycle', () => {
    const project = projectRepo.create({
      id: 'proj_1',
      name: 'Evolve Agent',
      path: '/projects/evolve',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(project.id).toBe('proj_1');
    expect(projectRepo.findById('proj_1')?.name).toBe('Evolve Agent');
    expect(projectRepo.findByPath('/projects/evolve')?.id).toBe('proj_1');
    expect(projectRepo.list()).toHaveLength(1);
  });

  it('manages sessions and transactional session creation with initial event', () => {
    projectRepo.create({
      id: 'proj_1',
      name: 'Evolve',
      path: '/projects/evolve',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Transactional creation
    const session = sessionRepo.createWithInitialEvent(
      {
        id: 'sess_1',
        projectId: 'proj_1',
        goal: 'Refactor core modules',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'evt_1',
        type: 'session:started',
        payload: JSON.stringify({ goal: 'Refactor core modules' }),
        timestamp: Date.now(),
      },
    );

    expect(session.id).toBe('sess_1');
    expect(session.status).toBe('active');

    // Verify initial event was committed atomically
    const sessionEvents = eventRepo.listBySession('sess_1');
    expect(sessionEvents).toHaveLength(1);
    expect(sessionEvents[0]?.type).toBe('session:started');

    // Update status
    const updated = sessionRepo.updateStatus('sess_1', 'completed');
    expect(updated?.status).toBe('completed');
  });

  it('records tool calls and handles transactional completion with feedback', () => {
    projectRepo.create({
      id: 'proj_1',
      name: 'Evolve',
      path: '/projects/evolve',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    sessionRepo.create({
      id: 'sess_1',
      projectId: 'proj_1',
      goal: 'Run test suite',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const call = toolCallRepo.recordCall({
      id: 'call_1',
      sessionId: 'sess_1',
      toolName: 'fs_read',
      arguments: JSON.stringify({ path: 'README.md' }),
      status: 'running',
      createdAt: Date.now(),
    });
    expect(call.id).toBe('call_1');

    // Atomic completion + feedback transaction
    const completed = toolCallRepo.completeWithFeedback(
      'call_1',
      {
        status: 'success',
        output: '# Evolve Project',
      },
      {
        id: 'feed_1',
        sessionId: 'sess_1',
        type: 'automated_test',
        rating: 1,
        notes: 'File read successfully',
        createdAt: Date.now(),
      },
    );

    expect(completed.status).toBe('success');
    expect(completed.output).toBe('# Evolve Project');

    const feedbackList = feedbackRepo.listByToolCall('call_1');
    expect(feedbackList).toHaveLength(1);
    expect(feedbackList[0]?.rating).toBe(1);
  });

  it('manages self-improving knowledge / reflexion records', () => {
    projectRepo.create({
      id: 'proj_1',
      name: 'Evolve',
      path: '/projects/evolve',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    knowledgeRepo.upsert({
      id: 'know_1',
      projectId: 'proj_1',
      category: 'syntax_fix',
      key: 'tsc_esm_import',
      content: 'Local relative imports in NodeNext must use .js extensions',
      confidence: 0.9,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const found = knowledgeRepo.findByKey('tsc_esm_import', 'proj_1');
    expect(found?.content).toContain('.js extensions');

    // Upsert updates content
    knowledgeRepo.upsert({
      id: 'know_2', // Even with different new ID, key matches
      projectId: 'proj_1',
      category: 'syntax_fix',
      key: 'tsc_esm_import',
      content: 'Local relative imports in NodeNext require .js extensions strictly',
      confidence: 1.0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const updated = knowledgeRepo.findByKey('tsc_esm_import', 'proj_1');
    expect(updated?.content).toContain('strictly');
    expect(updated?.confidence).toBe(1.0);
  });

  it('manages training examples and model versions with active state transactions', () => {
    trainingRepo.record({
      id: 'train_1',
      prompt: 'Write hello world in TS',
      response: 'console.log("hello world");',
      critique: 'Concise and correct',
      isSuccessful: 1,
      createdAt: Date.now(),
    });

    const successfulExamples = trainingRepo.listSuccessful();
    expect(successfulExamples).toHaveLength(1);

    // Model versions
    modelRepo.register({
      id: 'mod_1',
      provider: 'ollama',
      name: 'qwen2.5-coder:7b',
      isActive: 1,
      installedAt: Date.now(),
    });

    modelRepo.register({
      id: 'mod_2',
      provider: 'ollama',
      name: 'deepseek-coder:6.7b',
      isActive: 0,
      installedAt: Date.now(),
    });

    expect(modelRepo.getActive('ollama')?.name).toBe('qwen2.5-coder:7b');

    // Switch active version atomically
    modelRepo.setActive('mod_2');
    expect(modelRepo.getActive('ollama')?.name).toBe('deepseek-coder:6.7b');
  });
});
