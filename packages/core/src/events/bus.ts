import type {
  CoreEventType,
  EventBus,
  EventEnvelope,
  EventListener,
  Unsubscribe,
} from './types.js';

/**
 * Strongly-typed in-memory event bus with fault isolation and wildcard listener support.
 */
export class InMemoryEventBus implements EventBus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly listeners: Map<CoreEventType, Set<EventListener<any>>> = new Map();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly anyListeners: Set<EventListener<any>> = new Set();

  public emit<K extends CoreEventType>(event: K, envelope: EventEnvelope<K>): void {
    // 1. Notify wildcard listeners
    if (this.anyListeners.size > 0) {
      const anyCopy = Array.from(this.anyListeners);
      for (const listener of anyCopy) {
        try {
          listener(envelope);
        } catch {
          // Fault isolation: prevent subscriber error from breaking event loop
        }
      }
    }

    // 2. Notify specific event listeners
    const specific = this.listeners.get(event);
    if (!specific || specific.size === 0) {
      return;
    }

    const listenersCopy = Array.from(specific);
    for (const listener of listenersCopy) {
      try {
        listener(envelope);
      } catch {
        // Fault isolation
      }
    }
  }

  public on<K extends CoreEventType>(
    event: K,
    listener: EventListener<EventEnvelope<K>>,
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

  public onAny(listener: EventListener<EventEnvelope>): Unsubscribe {
    this.anyListeners.add(listener);
    return () => {
      this.anyListeners.delete(listener);
    };
  }

  public once<K extends CoreEventType>(
    event: K,
    listener: EventListener<EventEnvelope<K>>,
  ): Unsubscribe {
    const wrapped: EventListener<EventEnvelope<K>> = (envelope) => {
      this.off(event, wrapped);
      listener(envelope);
    };
    return this.on(event, wrapped);
  }

  public off<K extends CoreEventType>(event: K, listener: EventListener<EventEnvelope<K>>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  public removeAllListeners(event?: CoreEventType): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
      this.anyListeners.clear();
    }
  }
}
