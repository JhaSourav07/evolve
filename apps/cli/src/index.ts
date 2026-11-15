#!/usr/bin/env node
import {
  createSessionId,
  EvolveConfigSchema,
  getEvolveInfo,
  InMemoryEventBus,
  validateOrThrow,
  type EvolveConfig,
  type SessionId,
} from '@evolve/core';

export function formatCliBanner(): string {
  const info = getEvolveInfo();
  return `${info.name} v${info.version} (Local-First: ${info.localFirst ? 'true' : 'false'})`;
}

export interface CliSession {
  sessionId: SessionId;
  config: EvolveConfig;
  events: InMemoryEventBus;
}

export function initCliSession(rootDir: string): CliSession {
  const config = validateOrThrow(EvolveConfigSchema, {
    workspace: { rootDir },
  });
  const sessionId = createSessionId();
  const events = new InMemoryEventBus();

  return { sessionId, config, events };
}

export function runCli(): void {
  console.log(formatCliBanner());
}

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  runCli();
}
