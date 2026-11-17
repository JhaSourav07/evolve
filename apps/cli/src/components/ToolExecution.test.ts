import { describe, expect, it } from 'vitest';
import { formatToolAction, formatToolPastTense } from './ToolExecution.js';

describe('ToolExecution Action Formatter', () => {
  it('formats active and completed action phrases for read_file', () => {
    expect(formatToolAction('read_file', { path: 'src/server.ts' })).toBe('Reading src/server.ts');
    expect(formatToolPastTense('read_file', { path: 'src/server.ts' })).toBe('Read src/server.ts');
  });

  it('formats active and completed action phrases for list_files', () => {
    expect(formatToolAction('list_files', { path: 'packages/core' })).toBe('Listing packages/core');
    expect(formatToolPastTense('list_files', { path: 'packages/core' })).toBe('Listed packages/core');
  });

  it('formats active and completed action phrases for search_code', () => {
    expect(formatToolAction('search_code', { query: 'authenticate' })).toBe('Searching "authenticate"');
    expect(formatToolPastTense('search_code', { query: 'authenticate' })).toBe('Searched "authenticate"');
  });

  it('formats active and completed action phrases for edit_file and write_file', () => {
    expect(formatToolAction('edit_file', { path: 'src/auth/jwt.ts' })).toBe('Editing src/auth/jwt.ts');
    expect(formatToolPastTense('edit_file', { path: 'src/auth/jwt.ts' })).toBe('Edited src/auth/jwt.ts');

    expect(formatToolAction('write_file', { path: 'tests/auth.test.ts' })).toBe('Writing tests/auth.test.ts');
    expect(formatToolPastTense('write_file', { path: 'tests/auth.test.ts' })).toBe('Wrote tests/auth.test.ts');
  });

  it('formats active and completed action phrases for run_command', () => {
    expect(formatToolAction('run_command', { command: 'pnpm test' })).toBe('Running pnpm test');
    expect(formatToolPastTense('run_command', { command: 'pnpm test' })).toBe('Ran pnpm test');
  });

  it('formats repository intelligence tools cleanly', () => {
    expect(formatToolAction('inspect_project')).toBe('Inspecting project structure');
    expect(formatToolPastTense('inspect_project')).toBe('Inspected project structure');

    expect(formatToolAction('get_project_structure')).toBe('Reading project layout');
    expect(formatToolPastTense('get_project_structure')).toBe('Read project layout');

    expect(formatToolAction('find_symbol', { name: 'AgentRuntime' })).toBe('Locating symbol "AgentRuntime"');
    expect(formatToolPastTense('find_symbol', { name: 'AgentRuntime' })).toBe('Located symbol "AgentRuntime"');

    expect(formatToolAction('find_references', { name: 'AgentRuntime' })).toBe('Finding references for "AgentRuntime"');
    expect(formatToolPastTense('find_references', { name: 'AgentRuntime' })).toBe('Found references for "AgentRuntime"');

    expect(formatToolAction('get_dependencies', { path: 'packages/agent/src/index.ts' })).toBe(
      'Inspecting dependencies of packages/agent/src/index.ts',
    );
    expect(formatToolPastTense('get_dependencies', { path: 'packages/agent/src/index.ts' })).toBe(
      'Analyzed dependencies of packages/agent/src/index.ts',
    );

    expect(formatToolAction('get_related_files', { path: 'packages/agent/src/index.ts' })).toBe(
      'Tracing related files for packages/agent/src/index.ts',
    );
    expect(formatToolPastTense('get_related_files', { path: 'packages/agent/src/index.ts' })).toBe(
      'Traced related files for packages/agent/src/index.ts',
    );
  });

  it('falls back to tool name and argument summary for custom tools', () => {
    expect(formatToolAction('custom_indexer', { target: 'all' })).toBe('custom_indexer target="all"');
    expect(formatToolPastTense('custom_indexer')).toBe('custom_indexer');
  });
});

