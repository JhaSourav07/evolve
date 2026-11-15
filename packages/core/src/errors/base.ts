import type { ErrorCode } from './codes.js';

export interface EvolveErrorOptions {
  cause?: unknown;
  details?: unknown;
  isOperational?: boolean;
}

/**
 * Base error class for all Evolve application errors.
 * Guarantees standard properties across the entire system.
 */
export class EvolveError extends Error {
  public readonly code: ErrorCode;
  public readonly details: unknown;
  public readonly isOperational: boolean;
  public readonly timestamp: number;

  constructor(message: string, code: ErrorCode, options: EvolveErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = code;
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;
    this.timestamp = Date.now();

    // Preserve clean stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      isOperational: this.isOperational,
      timestamp: this.timestamp,
    };
  }
}
