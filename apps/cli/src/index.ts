#!/usr/bin/env node
import { getEvolveInfo } from '@evolve/core';

export function formatCliBanner(): string {
  const info = getEvolveInfo();
  return `${info.name} v${info.version} (Local-First: ${info.localFirst ? 'true' : 'false'})`;
}

export function runCli(): void {
  console.log(formatCliBanner());
}

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  runCli();
}
