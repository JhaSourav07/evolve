import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createSessionId,
  createToolCallId,
  type AgentTool,
  type EventEnvelope,
} from '@evolve/core';
import { initDatabase, EventService, ProjectRepository, SessionRepository } from '@evolve/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MockModelProvider } from '../providers/mock.js';
import { readFileTool, writeFileTool } from '../tools/basic.js';
import { ToolRegistry } from '../tools/registry.js';
import { AgentRuntime } from './agent.js';
import { ContextManager } from './context.js';
import { ConversationManager } from './conversation.js';

describe('AgentRuntime', () => {
  let tmpDir: string;
  let provider: MockModelProvider;
  let tools: ToolRegistry;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-runtime-test-'));
    provider = new MockModelProvider();
    tools = new ToolRegistry();
    tools.register(readFileTool);
    tools.register(writeFileTool);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('executes a complete multi-step task involving multiple tool calls', async () => {
    // Setup initial workspace file
    const inputFile = path.join(tmpDir, 'source.txt');
    fs.writeFileSync(inputFile, 'hello world from evolve', 'utf-8');

    // 1. Step 1: Model reads source.txt
    const call1Id = createToolCallId();
    provider.enqueueResponse({
      finishReason: 'tool_calls',
      message: {
        role: 'assistant',
        content: 'I will read the source file first.',
        toolCalls: [
          {
            id: call1Id,
            name: 'read_file',
            arguments: { path: 'source.txt' },
          },
        ],
      },
    });

    // 2. Step 2: Model writes uppercase content to output.txt
    const call2Id = createToolCallId();
    provider.enqueueResponse({
      finishReason: 'tool_calls',
      message: {
        role: 'assistant',
        content: 'Now I will write the transformed uppercase content to output.txt.',
        toolCalls: [
          {
            id: call2Id,
            name: 'write_file',
            arguments: { path: 'output.txt', content: 'HELLO WORLD FROM EVOLVE' },
          },
        ],
      },
    });

    // 3. Step 3: Model finishes task with final summary
    provider.enqueueResponse({
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content: 'Task completed successfully: read source.txt and created output.txt.',
      },
    });

    const emittedEvents: EventEnvelope[] = [];
    const runtime = new AgentRuntime({
      provider,
      tools,
      config: {
        workspaceRoot: tmpDir,
        maxSteps: 10,
        temperature: 0.2,
      },
    });

    runtime.onAny((envelope) => {
      emittedEvents.push(envelope);
    });

    const result = await runtime.run('Please transform source.txt into uppercase in output.txt');

    expect(result.success).toBe(true);
    expect(result.stepsExecuted).toBe(3);
    expect(result.finalResponse).toContain('Task completed successfully');

    // Verify output file on disk
    const outputFile = path.join(tmpDir, 'output.txt');
    expect(fs.existsSync(outputFile)).toBe(true);
    expect(fs.readFileSync(outputFile, 'utf-8')).toBe('HELLO WORLD FROM EVOLVE');

    // Verify event stream ordering
    const eventTypes = emittedEvents.map((e) => e.type);
    expect(eventTypes).toEqual([
      'session_started',
      'user_prompt',
      'assistant_response',
      'tool_call',
      'tool_result',
      'assistant_response',
      'tool_call',
      'tool_result',
      'assistant_response',
      'session_completed',
    ]);

    // Verify final event
    const lastEvent = emittedEvents[emittedEvents.length - 1];
    expect(lastEvent?.type).toBe('session_completed');
    if (lastEvent?.type === 'session_completed') {
      expect(lastEvent.payload.success).toBe(true);
    }
  });

  it('enforces maximum iteration limit when model exceeds maxSteps', async () => {
    // Model continuously calls tools without stopping
    provider.enqueueResponse({
      finishReason: 'tool_calls',
      message: {
        role: 'assistant',
        content: 'Reading step 1',
        toolCalls: [
          {
            id: createToolCallId(),
            name: 'read_file',
            arguments: { path: 'dummy.txt' },
          },
        ],
      },
    });
    provider.enqueueResponse({
      finishReason: 'tool_calls',
      message: {
        role: 'assistant',
        content: 'Reading step 2',
        toolCalls: [
          {
            id: createToolCallId(),
            name: 'read_file',
            arguments: { path: 'dummy.txt' },
          },
        ],
      },
    });

    const runtime = new AgentRuntime({
      provider,
      tools,
      config: {
        workspaceRoot: tmpDir,
        maxSteps: 2,
      },
    });

    const result = await runtime.run('Loop forever');

    expect(result.success).toBe(false);
    expect(result.stepsExecuted).toBe(2);
    expect(result.error).toContain('Maximum iteration limit reached (2 steps)');
  });

  it('supports cancellation via AbortSignal', async () => {
    const controller = new AbortController();

    // Abort immediately
    controller.abort();

    const runtime = new AgentRuntime({
      provider,
      tools,
      config: {
        workspaceRoot: tmpDir,
        maxSteps: 5,
      },
    });

    const result = await runtime.run('Should be aborted', { signal: controller.signal });

    expect(result.success).toBe(false);
    expect(result.error).toContain('aborted');
  });

  it('recovers gracefully from unknown tool requests', async () => {
    const unknownCallId = createToolCallId();
    provider.enqueueResponse({
      finishReason: 'tool_calls',
      message: {
        role: 'assistant',
        content: 'I will use magic_wand',
        toolCalls: [
          {
            id: unknownCallId,
            name: 'magic_wand',
            arguments: { spell: 'lumos' },
          },
        ],
      },
    });

    // Step 2: model realizes tool is unavailable and stops
    provider.enqueueResponse({
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content: 'magic_wand is unavailable, aborting attempt gracefully.',
      },
    });

    const emittedToolResults: EventEnvelope<'tool_result'>[] = [];
    const runtime = new AgentRuntime({
      provider,
      tools,
      config: {
        workspaceRoot: tmpDir,
        maxSteps: 5,
      },
    });

    runtime.on('tool_result', (env) => {
      emittedToolResults.push(env);
    });

    const result = await runtime.run('Try unknown tool');

    expect(result.success).toBe(true);
    expect(result.stepsExecuted).toBe(2);
    expect(emittedToolResults.length).toBe(1);
    expect(emittedToolResults[0]?.payload.success).toBe(false);
    expect(emittedToolResults[0]?.payload.output).toContain("Tool 'magic_wand' is not recognized");
  });

  it('recovers gracefully from invalid tool arguments', async () => {
    const invalidCallId = createToolCallId();
    provider.enqueueResponse({
      finishReason: 'tool_calls',
      message: {
        role: 'assistant',
        content: 'Calling read_file with bad arguments',
        toolCalls: [
          {
            id: invalidCallId,
            name: 'read_file',
            arguments: { wrong_param: 123 }, // missing 'path'
          },
        ],
      },
    });

    provider.enqueueResponse({
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content: 'I apologize for the bad arguments.',
      },
    });

    const runtime = new AgentRuntime({
      provider,
      tools,
      config: {
        workspaceRoot: tmpDir,
        maxSteps: 5,
      },
    });

    const result = await runtime.run('Bad args test');
    expect(result.success).toBe(true);
    expect(result.stepsExecuted).toBe(2);

    const messages = runtime.getConversation().getMessages();
    const toolMsg = messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain("Invalid arguments for tool 'read_file'");
  });

  it('recovers gracefully when a tool throws an unexpected exception', async () => {
    const failingTool: AgentTool<{ value: string }> = {
      definition: {
        name: 'exploding_tool',
        description: 'Always explodes',
        parameters: z.object({ value: z.string() }),
      },
      async execute() {
        throw new Error('Fatal filesystem corruption simulation');
      },
    };

    tools.register(failingTool);

    const callId = createToolCallId();
    provider.enqueueResponse({
      finishReason: 'tool_calls',
      message: {
        role: 'assistant',
        content: 'Triggering crash',
        toolCalls: [
          {
            id: callId,
            name: 'exploding_tool',
            arguments: { value: 'boom' },
          },
        ],
      },
    });

    provider.enqueueResponse({
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content: 'Handled explosion safely.',
      },
    });

    const runtime = new AgentRuntime({
      provider,
      tools,
      config: {
        workspaceRoot: tmpDir,
        maxSteps: 5,
      },
    });

    const result = await runtime.run('Explosion test');
    expect(result.success).toBe(true);

    const toolMsg = runtime
      .getConversation()
      .getMessages()
      .find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain(
      'Tool execution exception: Fatal filesystem corruption simulation',
    );
  });

  it('persists all runtime events to SQLite via EventService', async () => {
    const testDbPath = path.join(tmpDir, 'test.db');
    const { db, close } = initDatabase({ path: testDbPath });
    const projectRepo = new ProjectRepository(db);
    const sessionRepo = new SessionRepository(db);

    const project = projectRepo.create({
      id: 'proj_test',
      name: 'Test Project',
      path: tmpDir,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const sessionId = createSessionId();
    sessionRepo.create({
      id: sessionId,
      projectId: project.id,
      goal: 'Answer question',
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const eventService = new EventService(db);

    provider.enqueueResponse({
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content: 'Immediate answer with EventService.',
      },
    });

    const runtime = new AgentRuntime({
      provider,
      tools,
      eventSink: eventService,
      config: {
        workspaceRoot: tmpDir,
        maxSteps: 5,
      },
    });

    try {
      const result = await runtime.run('Answer question', { sessionId });
      expect(result.success).toBe(true);

      // Retrieve events from SQLite database
      const dbEvents = eventService.getSessionEvents(sessionId);
      expect(dbEvents.length).toBe(4); // session_started, user_prompt, assistant_response, session_completed
      const types = dbEvents.map((e) => e.type);
      expect(types).toContain('session_started');
      expect(types).toContain('user_prompt');
      expect(types).toContain('assistant_response');
      expect(types).toContain('session_completed');
    } finally {
      close();
    }
  });

  it('never echoes the user prompt as finalResponse when model invocation fails', async () => {
    provider.generate = async () => {
      throw new Error('Model "qwen2.5-coder:7b" not found');
    };

    const runtime = new AgentRuntime({
      provider,
      tools,
      config: { workspaceRoot: tmpDir },
    });

    const userPrompt = 'Analyse this confidential codebase for me';
    const result = await runtime.run(userPrompt);

    expect(result.success).toBe(false);
    // Critical regression assertion: finalResponse MUST NOT equal user prompt!
    expect(result.finalResponse).not.toBe(userPrompt);
    expect(result.finalResponse).toBe('');
    expect(result.error).toContain('Model invocation failed: Model "qwen2.5-coder:7b" not found');
  });

  it('preserves multi-turn conversation history across consecutive runs on the same runtime', async () => {
    const runtime = new AgentRuntime({
      provider,
      tools,
      config: { workspaceRoot: tmpDir },
    });

    // Turn 1
    provider.enqueueResponse({
      finishReason: 'stop',
      message: { role: 'assistant', content: 'Turn 1 assistant answer.' },
    });

    const res1 = await runtime.run('Turn 1 user question');
    expect(res1.success).toBe(true);
    expect(res1.finalResponse).toBe('Turn 1 assistant answer.');

    // Turn 2
    provider.enqueueResponse({
      finishReason: 'stop',
      message: { role: 'assistant', content: 'Turn 2 assistant answer with memory.' },
    });

    const res2 = await runtime.run('Turn 2 user question');
    expect(res2.success).toBe(true);
    expect(res2.finalResponse).toBe('Turn 2 assistant answer with memory.');

    // Check messages in conversation manager
    const messages = runtime.getConversation().getMessages();
    expect(messages).toHaveLength(4);
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.content).toBe('Turn 1 user question');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[1]?.content).toBe('Turn 1 assistant answer.');
    expect(messages[2]?.role).toBe('user');
    expect(messages[2]?.content).toBe('Turn 2 user question');
    expect(messages[3]?.role).toBe('assistant');
    expect(messages[3]?.content).toBe('Turn 2 assistant answer with memory.');
  });

  it('emits session_started only once for multi-turn sessions', async () => {
    const events: EventEnvelope[] = [];
    const runtime = new AgentRuntime({
      provider,
      tools,
      config: { workspaceRoot: tmpDir },
    });
    runtime.onAny((e) => events.push(e));

    provider.enqueueResponse({
      finishReason: 'stop',
      message: { role: 'assistant', content: 'Answer 1' },
    });
    await runtime.run('Hello');

    provider.enqueueResponse({
      finishReason: 'stop',
      message: { role: 'assistant', content: 'Answer 2' },
    });
    await runtime.run('Followup');

    const sessionStartedEvents = events.filter((e) => e.type === 'session_started');
    expect(sessionStartedEvents).toHaveLength(1);
  });

  it('detects intermediate continuation fillers and nudges the model instead of prematurely terminating', async () => {
    // Step 1: Model outputs "Let me continue" without tool calls
    provider.enqueueResponse({
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content: 'Let me continue',
      },
    });

    // Step 2: After being nudged, model provides the comprehensive final answer
    provider.enqueueResponse({
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content: 'Here is the complete analysis of the architecture and authentication system.',
      },
    });

    const runtime = new AgentRuntime({
      provider,
      tools,
      config: {
        workspaceRoot: tmpDir,
        maxSteps: 5,
      },
    });

    const result = await runtime.run('Analyse this repository and explain authentication.');

    expect(result.success).toBe(true);
    expect(result.stepsExecuted).toBe(2);
    expect(result.finalResponse).toBe(
      'Here is the complete analysis of the architecture and authentication system.',
    );
  });
});

describe('ContextManager', () => {
  it('estimates tokens accurately', () => {
    const manager = new ContextManager({ workspaceRoot: '/test' });
    expect(manager.estimateTokens('Hello')).toBe(2);
    expect(manager.estimateTokens('12345678')).toBe(2);
  });

  it('prunes conversation when exceeding maxTokens while preserving tool call pairing', () => {
    const manager = new ContextManager({
      workspaceRoot: '/test',
      maxTokens: 50, // very small budget
    });

    const conv = new ConversationManager();
    conv.addUserMessage('Initial goal prompt that must be preserved');

    // Add many intermediate messages
    for (let i = 0; i < 15; i++) {
      conv.addAssistantMessage(`Intermediate message ${i}`);
    }

    const messages = conv.getMessages();
    const contextMessages = manager.buildContextMessages(messages);

    // System prompt must be at 0
    expect(contextMessages[0]?.role).toBe('system');
    // Initial user prompt must be preserved at 1
    expect(contextMessages[1]?.role).toBe('user');
    expect(contextMessages[1]?.content).toContain('Initial goal prompt');
    // Notice message inserted
    expect(contextMessages.some((m) => m.content.includes('pruned'))).toBe(true);
  });
});
