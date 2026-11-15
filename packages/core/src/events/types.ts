import type { SessionId } from '../ids/index.js';
import type { CoreEventType, EventPayloadMap } from './schemas.js';

export * from './schemas.js';

export interface EventEnvelope<TType extends CoreEventType = CoreEventType> {
  id: string;
  sessionId: SessionId;
  type: TType;
  timestamp: number;
  payload: EventPayloadMap[TType];
}

export interface EventFilterOptions {
  sessionId?: SessionId | string;
  types?: readonly CoreEventType[];
  since?: number;
  until?: number;
  limit?: number;
}

export type EventListener<T> = (payload: T) => void;
export type Unsubscribe = () => void;

export interface EventBus {
  emit<K extends CoreEventType>(event: K, envelope: EventEnvelope<K>): void;
  on<K extends CoreEventType>(event: K, listener: EventListener<EventEnvelope<K>>): Unsubscribe;
  onAny(listener: EventListener<EventEnvelope>): Unsubscribe;
  once<K extends CoreEventType>(event: K, listener: EventListener<EventEnvelope<K>>): Unsubscribe;
  off<K extends CoreEventType>(event: K, listener: EventListener<EventEnvelope<K>>): void;
  removeAllListeners(event?: CoreEventType): void;
}
