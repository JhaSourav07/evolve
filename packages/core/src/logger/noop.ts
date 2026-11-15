import type { LogContext, Logger } from './types.js';

export class NoOpLogger implements Logger {
  public debug(_message: string, _context?: LogContext): void {}
  public info(_message: string, _context?: LogContext): void {}
  public warn(_message: string, _context?: LogContext): void {}
  public error(_message: string, _error?: unknown, _context?: LogContext): void {}
  public child(_context: LogContext): Logger {
    return this;
  }
}

export const noopLogger = new NoOpLogger();
