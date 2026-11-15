import { describe, expect, it } from 'vitest';
import { buildCli, formatCliBanner, initCliSession } from './index.js';

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

  it('builds commander CLI with all required commands and options', () => {
    const program = buildCli();
    const commandNames = program.commands.map((c) => c.name());

    expect(commandNames).toContain('chat');
    expect(commandNames).toContain('init');
    expect(commandNames).toContain('status');
    expect(commandNames).toContain('history');
    expect(commandNames).toContain('memory');
    expect(commandNames).toContain('integrations');
    expect(commandNames).toContain('feedback');
    expect(commandNames).toContain('config');
    expect(commandNames).toContain('models');

    // Verify memory command options
    const memoryCmd = program.commands.find((c) => c.name() === 'memory');
    expect(memoryCmd?.options.map((o) => o.long)).toContain('--add');
    expect(memoryCmd?.options.map((o) => o.long)).toContain('--category');
    expect(memoryCmd?.options.map((o) => o.long)).toContain('--key');
    expect(memoryCmd?.options.map((o) => o.long)).toContain('--content');

    // Verify integrations command options
    const intCmd = program.commands.find((c) => c.name() === 'integrations');
    expect(intCmd?.options.map((o) => o.long)).toContain('--import');

    // Verify feedback command options
    const fbCmd = program.commands.find((c) => c.name() === 'feedback');
    expect(fbCmd?.options.map((o) => o.long)).toContain('--rating');
    expect(fbCmd?.options.map((o) => o.long)).toContain('--notes');
    expect(fbCmd?.options.map((o) => o.long)).toContain('--correction');
  });
});
