import { ValidationError } from '../errors/specific.js';
import { EventSchemas, type CoreEventType, type EventPayloadMap } from './schemas.js';

/**
 * Validates an unknown payload against the registered Zod schema for the event type.
 * Throws a ValidationError if the payload fails schema validation.
 */
export function validateEventPayload<T extends CoreEventType>(
  type: T,
  payload: unknown,
): EventPayloadMap[T] {
  const schema = EventSchemas[type];
  if (!schema) {
    throw new ValidationError(`Unknown event type: ${type}`);
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ValidationError(`Validation failed for event [${type}]`, {
      details: result.error.issues,
    });
  }

  return result.data as EventPayloadMap[T];
}
