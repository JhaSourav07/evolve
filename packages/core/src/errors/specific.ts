import { EvolveError, type EvolveErrorOptions } from './base.js';
import { ErrorCodes } from './codes.js';

export class ConfigurationError extends EvolveError {
  constructor(message: string, options?: EvolveErrorOptions) {
    super(message, ErrorCodes.CONFIG_INVALID, options);
  }
}

export class ValidationError extends EvolveError {
  constructor(message: string, options?: EvolveErrorOptions) {
    super(message, ErrorCodes.VALIDATION_FAILED, options);
  }
}

export class ModelProviderError extends EvolveError {
  constructor(message: string, options?: EvolveErrorOptions) {
    super(message, ErrorCodes.MODEL_GENERATION_FAILED, options);
  }
}

export class ToolExecutionError extends EvolveError {
  public readonly toolName: string;

  constructor(toolName: string, message: string, options?: EvolveErrorOptions) {
    super(`Tool [${toolName}] failed: ${message}`, ErrorCodes.TOOL_EXECUTION_FAILED, options);
    this.toolName = toolName;
  }
}

export class SecurityError extends EvolveError {
  constructor(message: string, options?: EvolveErrorOptions) {
    super(message, ErrorCodes.SECURITY_POLICY_VIOLATION, {
      ...options,
      isOperational: false, // Security errors are critical
    });
  }
}

export class PathTraversalError extends SecurityError {
  public readonly targetPath: string;

  constructor(targetPath: string, options?: EvolveErrorOptions) {
    super(`Path traversal attempt detected: "${targetPath}"`, options);
    this.targetPath = targetPath;
  }
}
