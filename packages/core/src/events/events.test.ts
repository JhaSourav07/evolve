import { describe, expect, it, vi } from 'vitest';
import { createSessionId, createToolCallId } from '../ids/index.js';
import { InMemoryEventBus } from './bus.js';

describe('InMemoryEventBus', () => {
  it('publishes and subscribes to typed events', () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn();
    const sessionId = createSessionId();

    bus.on('session:started', handler);
    bus.emit('session:started', {
      sessionId,
      goal: 'Write unit tests',
      timestamp: Date.now(),
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        goal: 'Write unit tests',
      }),
    );
  });

  it('unsubscribes cleanly via returned unsubscribe function', () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on('tool:executing', handler);

    bus.emit('tool:executing', {
      sessionId: createSessionId(),
      toolCallId: createToolCallId(),
      toolName: 'fs_read',
      params: { path: 'file.txt' },
      timestamp: Date.now(),
    });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();

    bus.emit('tool:executing', {
      sessionId: createSessionId(),
      toolCallId: createToolCallId(),
      toolName: 'fs_read',
      params: { path: 'file.txt' },
      timestamp: Date.now(),
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('supports once listeners that fire exactly once', () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn();

    bus.once('model:stream', handler);

    bus.emit('model:stream', {
      sessionId: createSessionId(),
      delta: 'token1',
      timestamp: Date.now(),
    });
    bus.emit('model:stream', {
      sessionId: createSessionId(),
      delta: 'token2',
      timestamp: Date.now(),
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        delta: 'token1',
      }),
    );
  });
});
