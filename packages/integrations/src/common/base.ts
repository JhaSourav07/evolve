import {
  validateEventPayload,
  type CoreEventType,
  type EventInputPayloadMap,
  type SessionId,
} from '@evolve/core';
import type { ConsentManager } from '../consent/manager.js';
import type { ConsentScope, IntegrationSource, SourceAttribution } from '../consent/types.js';
import type {
  IntegratedEventEnvelope,
  IntegratedEventListener,
  IntegrationPublisher,
} from './types.js';

export abstract class BaseIntegrationAdapter {
  protected readonly listeners: IntegratedEventListener[] = [];

  constructor(
    public readonly source: IntegrationSource,
    protected readonly consentManager: ConsentManager,
    protected readonly publisher?: IntegrationPublisher,
  ) {}

  public onIntegratedEvent(listener: IntegratedEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  protected publishIntegrated<T extends CoreEventType>(
    sessionId: SessionId | string,
    type: T,
    payload: EventInputPayloadMap[T],
    options?: {
      scope?: ConsentScope;
      originalId?: string;
      customMetadata?: Record<string, unknown>;
    },
  ): IntegratedEventEnvelope<T> {
    // 1. Verify consent and produce immutable source attribution
    const baseAttribution = this.consentManager.assertConsent(
      this.source,
      options?.scope,
      options?.originalId,
    );

    const attribution: SourceAttribution = {
      ...baseAttribution,
      metadata: {
        ...baseAttribution.metadata,
        ...options?.customMetadata,
      },
    };

    // 2. Validate payload against core Evolve schema
    const validatedPayload = validateEventPayload(type, payload);

    // 3. Persist / Publish via central EventService if configured
    let baseEnvelope;
    if (this.publisher) {
      baseEnvelope = this.publisher.publish(sessionId, type, validatedPayload);
    } else {
      baseEnvelope = {
        id: `evt_int_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        sessionId: sessionId as SessionId,
        type,
        timestamp: Date.now(),
        payload: validatedPayload,
      };
    }

    const integratedEnvelope: IntegratedEventEnvelope<T> = {
      ...baseEnvelope,
      attribution,
    };

    // 4. Notify integrated listeners
    for (const listener of this.listeners) {
      listener(integratedEnvelope as IntegratedEventEnvelope);
    }

    return integratedEnvelope;
  }
}
