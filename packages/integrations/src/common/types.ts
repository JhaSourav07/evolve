import type { CoreEventType, EventEnvelope, EventInputPayloadMap, SessionId } from '@evolve/core';
import type { SourceAttribution } from '../consent/types.js';

export interface IntegratedEventEnvelope<
  TType extends CoreEventType = CoreEventType,
> extends EventEnvelope<TType> {
  attribution: SourceAttribution;
}

export interface IntegrationPublisher {
  publish<T extends CoreEventType>(
    sessionId: SessionId | string,
    type: T,
    payload: EventInputPayloadMap[T],
  ): EventEnvelope<T>;
}

export type IntegratedEventListener = (envelope: IntegratedEventEnvelope) => void;
