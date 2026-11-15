import { describe, expect, it } from 'vitest';
import { formatCliBanner, initCliSession } from './index.js';

describe('CLI Package', () => {
  it('formats the CLI banner using metadata from @evolve/core', () => {
    const banner = formatCliBanner();
    expect(banner).toBe('Evolve v0.1.0 (Local-First: true)');
  });

  it('initializes a CLI session using @evolve/core types and schemas', () => {
    const session = initCliSession('/home/user/project');
    expect(session.sessionId.startsWith('sess_')).toBe(true);
    expect(session.config.workspace.rootDir).toBe('/home/user/project');
    expect(session.config.model.model).toBe('qwen2.5-coder:7b');
    expect(session.events).toBeDefined();
  });
});
