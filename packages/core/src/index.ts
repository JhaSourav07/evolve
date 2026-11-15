export const EVOLVE_VERSION = '0.1.0' as const;

export interface EvolveInfo {
  name: string;
  version: string;
  localFirst: boolean;
}

export function getEvolveInfo(): EvolveInfo {
  return {
    name: 'Evolve',
    version: EVOLVE_VERSION,
    localFirst: true,
  };
}

export * from './ids/index.js';
export * from './errors/index.js';
export * from './config/index.js';
export * from './model/index.js';
export * from './tools/index.js';
export * from './events/index.js';
export * from './logger/index.js';
export * from './utils/index.js';
