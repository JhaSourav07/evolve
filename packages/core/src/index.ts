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
