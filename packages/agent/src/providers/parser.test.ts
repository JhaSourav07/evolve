import { describe, expect, it } from 'vitest';
import { cleanToolCallMarkup, parseOllamaToolCalls } from './parser.js';

describe('Ollama Tool Call Parser', () => {
  it('parses native Ollama tool calls with object arguments', () => {
    const raw = [
      {
        id: 'call_1',
        function: {
          name: 'fs_read',
          arguments: { path: 'README.md' },
        },
      },
    ];

    const result = parseOllamaToolCalls(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('fs_read');
    expect(result[0]?.arguments).toEqual({ path: 'README.md' });
  });

  it('parses native Ollama tool calls with JSON string arguments', () => {
    const raw = [
      {
        id: 'call_2',
        function: {
          name: 'execute_command',
          arguments: JSON.stringify({ command: 'pnpm test' }),
        },
      },
    ];

    const result = parseOllamaToolCalls(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('execute_command');
    expect(result[0]?.arguments).toEqual({ command: 'pnpm test' });
  });

  it('extracts fallback tool calls from markdown content when native tool calls are absent', () => {
    const content = `
I will read the configuration.
\`\`\`json
{
  "name": "fs_read",
  "arguments": { "path": "package.json" }
}
\`\`\`
    `;

    const result = parseOllamaToolCalls([], content);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('fs_read');
    expect(result[0]?.arguments).toEqual({ path: 'package.json' });
  });

  it('extracts fallback tool calls from XML <tool_call> tags', () => {
    const content = `
Let me inspect the file.
<tool_call>
{"name": "read_file", "arguments": {"path": "packages/core/src/model/types.ts"}}
</tool_call>
    `;

    const result = parseOllamaToolCalls([], content);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('read_file');
    expect(result[0]?.arguments).toEqual({ path: 'packages/core/src/model/types.ts' });

    expect(cleanToolCallMarkup(content)).toBe('Let me inspect the file.');
  });

  it('extracts multiple fallback tool calls from multiple XML <tool_call> tags', () => {
    const content = `
<tool_call>
{"name": "read_file", "arguments": {"path": "a.ts"}}
</tool_call>
<tool_call>
{"name": "read_file", "arguments": {"path": "b.ts"}}
</tool_call>
    `;

    const result = parseOllamaToolCalls([], content);
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('read_file');
    expect(result[0]?.arguments).toEqual({ path: 'a.ts' });
    expect(result[1]?.name).toBe('read_file');
    expect(result[1]?.arguments).toEqual({ path: 'b.ts' });
  });

  it('extracts array of tool calls in markdown fence', () => {
    const content = `
\`\`\`json
[
  { "name": "list_files", "arguments": { "path": "apps" } },
  { "name": "list_files", "arguments": { "path": "packages" } }
]
\`\`\`
    `;

    const result = parseOllamaToolCalls([], content);
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('list_files');
    expect(result[0]?.arguments).toEqual({ path: 'apps' });
    expect(result[1]?.name).toBe('list_files');
    expect(result[1]?.arguments).toEqual({ path: 'packages' });
  });

  it('returns empty array when no tool calls are present', () => {
    expect(parseOllamaToolCalls(undefined, 'Just normal text')).toEqual([]);
  });

  it('normalizes string booleans and numbers into primitive types', () => {
    const raw = [
      {
        id: 'call_normalize',
        function: {
          name: 'list_files',
          arguments: {
            path: '.',
            recursive: 'true',
            limit: '30',
            maxDepth: '3',
            otherFlag: 'false',
          },
        },
      },
    ];

    const result = parseOllamaToolCalls(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.arguments).toEqual({
      path: '.',
      recursive: true,
      limit: 30,
      maxDepth: 3,
      otherFlag: false,
    });
  });
});
