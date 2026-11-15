import { describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  EvolveError,
  PathTraversalError,
  SecurityError,
  ToolExecutionError,
  ValidationError,
} from './index.js';

describe('Application Error Hierarchy', () => {
  it('instantiates EvolveError with standard properties and JSON serialization', () => {
    const error = new EvolveError('Something broke', 'CONFIG_INVALID', {
      details: { key: 'model' },
      isOperational: true,
    });

    expect(error.name).toBe('EvolveError');
    expect(error.code).toBe('CONFIG_INVALID');
    expect(error.details).toEqual({ key: 'model' });
    expect(error.isOperational).toBe(true);
    expect(error.timestamp).toBeGreaterThan(0);

    const json = error.toJSON();
    expect(json['name']).toBe('EvolveError');
    expect(json['code']).toBe('CONFIG_INVALID');
  });

  it('instantiates domain-specific errors correctly', () => {
    const configErr = new ConfigurationError('Missing base URL');
    expect(configErr).toBeInstanceOf(EvolveError);
    expect(configErr.code).toBe('CONFIG_INVALID');

    const valErr = new ValidationError('Payload invalid');
    expect(valErr).toBeInstanceOf(EvolveError);
    expect(valErr.code).toBe('VALIDATION_FAILED');

    const toolErr = new ToolExecutionError('fs_read', 'File not found');
    expect(toolErr.toolName).toBe('fs_read');
    expect(toolErr.message).toContain('Tool [fs_read] failed');

    const secErr = new SecurityError('Forbidden command');
    expect(secErr.isOperational).toBe(false);

    const pathErr = new PathTraversalError('../../etc/passwd');
    expect(pathErr).toBeInstanceOf(SecurityError);
    expect(pathErr.targetPath).toBe('../../etc/passwd');
  });
});
