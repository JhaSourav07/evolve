import { describe, expect, it } from 'vitest';
import { EVOLVE_VERSION, getEvolveInfo } from './index.js';

describe('getEvolveInfo', () => {
  it('returns valid metadata for the Evolve core package', () => {
    const info = getEvolveInfo();
    expect(info.name).toBe('Evolve');
    expect(info.version).toBe(EVOLVE_VERSION);
    expect(info.localFirst).toBe(true);
  });
});
