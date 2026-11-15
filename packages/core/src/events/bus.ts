import type { AgentEventMap, EventBus, EventListener, Unsubscribe } from './types.js';

/**
 * High-performance, strongly-typed in-memory event bus.
 * Decouples agent execution from UI logging and persistence.
 */
export class InMemoryEventBus implements EventBus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly listeners: Map<keyof AgentEventMap, Set<EventListener<any>>> = new Map();

  public emit<K extends keyof AgentEventMap>(event: K, payload: AgentEventMap[K]): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners || eventListeners.size === 0) {
      return;
    }

    const listenersCopy = Array.from(eventListeners);
    for (const listener of listenersCopy) {
      try {
        listener(payload);
      } catch {
        // Prevent subscriber errors from halting the agent loop
        // In production, this can be piped to an internal diagnostic hook
      }
    }
  }

  public on<K extends keyof AgentEventMap>(
    event: K,
    listener: EventListener<AgentEventMap[K]>,
  ): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);

    return () => {
      this.off(event, listener);
    };
  }

  public once<K extends keyof AgentEventMap>(
    event: K,
    listener: EventListener<AgentEventMap[K]>,
  ): Unsubscribe {
    const wrapped: EventListener<AgentEventMap[K]> = (payload) => {
      this.off(event, wrapped);
      listener(payload);
    };
    return this.on(event, wrapped);
  }

  public off<K extends keyof AgentEventMap>(
    event: K,
    listener: EventListener<AgentEventMap[K]>,
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  public removeAllListeners(event?: keyof AgentEventMap): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
