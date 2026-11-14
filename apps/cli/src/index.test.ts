import { describe, expect, it } from 'vitest';
import { formatCliBanner } from './index.js';

describe('formatCliBanner', () => {
  it('formats the CLI banner using metadata from @evolve/core', () => {
    const banner = formatCliBanner();
    expect(banner).toBe('Evolve v0.1.0 (Local-First: true)');
  });
});
