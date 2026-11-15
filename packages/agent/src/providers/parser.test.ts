import { describe, expect, it } from 'vitest';
import { parseOllamaToolCalls } from './parser.js';

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

  it('returns empty array when no tool calls are present', () => {
    expect(parseOllamaToolCalls(undefined, 'Just normal text')).toEqual([]);
  });
});
