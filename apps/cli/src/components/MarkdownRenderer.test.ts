import { describe, expect, it } from 'vitest';
import {
  parseInlineTokens,
  parseMarkdownBlocks,
} from './MarkdownRenderer.js';

describe('MarkdownRenderer Parser', () => {
  it('parses inline markdown tokens correctly', () => {
    const input =
      '**Problem**: `EventService` couples SQLite persistence with `InMemoryEventBus`, creating race conditions.';
    const tokens = parseInlineTokens(input);

    expect(tokens).toEqual([
      { type: 'bold', text: 'Problem' },
      { type: 'text', text: ': ' },
      { type: 'code', text: 'EventService' },
      { type: 'text', text: ' couples SQLite persistence with ' },
      { type: 'code', text: 'InMemoryEventBus' },
      { type: 'text', text: ', creating race conditions.' },
    ]);
  });

  it('parses links and italics correctly', () => {
    const input = 'Check out [Evolve Docs](https://evolve.dev) and *italics*.';
    const tokens = parseInlineTokens(input);

    expect(tokens).toEqual([
      { type: 'text', text: 'Check out ' },
      { type: 'link', text: 'Evolve Docs', url: 'https://evolve.dev' },
      { type: 'text', text: ' and ' },
      { type: 'italic', text: 'italics' },
      { type: 'text', text: '.' },
    ]);
  });

  it('parses markdown headings, horizontal rules, and blockquotes', () => {
    const content = `
# Architecture Analysis
---
## 1. Decouple Event Bus ⭐⭐⭐
> Notice: Important architectural consideration.
### Implementation
    `;

    const blocks = parseMarkdownBlocks(content);

    const headings = blocks.filter((b) => b.type === 'heading');
    expect(headings).toHaveLength(3);
    expect(headings[0]).toEqual({
      type: 'heading',
      level: 1,
      text: 'Architecture Analysis',
    });
    expect(headings[1]).toEqual({
      type: 'heading',
      level: 2,
      text: '1. Decouple Event Bus ⭐⭐⭐',
    });
    expect(headings[2]).toEqual({
      type: 'heading',
      level: 3,
      text: 'Implementation',
    });

    const hr = blocks.filter((b) => b.type === 'horizontal_rule');
    expect(hr).toHaveLength(1);

    const quote = blocks.filter((b) => b.type === 'blockquote');
    expect(quote).toHaveLength(1);
    expect(quote[0]).toEqual({
      type: 'blockquote',
      text: 'Notice: Important architectural consideration.',
    });
  });

  it('parses code blocks with language identifiers', () => {
    const content = `
\`\`\`typescript
export class EventService {
  private readonly bus = new InMemoryEventBus();
}
\`\`\`
    `;

    const blocks = parseMarkdownBlocks(content);
    const codeBlocks = blocks.filter((b) => b.type === 'code_block');

    expect(codeBlocks).toHaveLength(1);
    expect(codeBlocks[0]).toEqual({
      type: 'code_block',
      lang: 'typescript',
      lines: [
        'export class EventService {',
        '  private readonly bus = new InMemoryEventBus();',
        '}',
      ],
    });
  });

  it('parses bullet lists and numbered lists with indentation', () => {
    const content = `
- Item 1
  - Nested item A
- Item 2

1. Step one
2. Step two
    `;

    const blocks = parseMarkdownBlocks(content);

    const bullets = blocks.filter((b) => b.type === 'bullet_item');
    expect(bullets).toHaveLength(3);
    expect(bullets[0]).toEqual({ type: 'bullet_item', indent: 0, text: 'Item 1' });
    expect(bullets[1]).toEqual({ type: 'bullet_item', indent: 1, text: 'Nested item A' });
    expect(bullets[2]).toEqual({ type: 'bullet_item', indent: 0, text: 'Item 2' });

    const numbered = blocks.filter((b) => b.type === 'numbered_item');
    expect(numbered).toHaveLength(2);
    expect(numbered[0]).toEqual({ type: 'numbered_item', indent: 0, number: '1', text: 'Step one' });
    expect(numbered[1]).toEqual({ type: 'numbered_item', indent: 0, number: '2', text: 'Step two' });
  });

  it('parses markdown tables', () => {
    const content = `
| Improvement | Effort | Impact |
|-------------|--------|--------|
| Event Archiving | Low | Keeps DB lean |
| Tool Approval State | Medium | Simplifies async flow |
    `;

    const blocks = parseMarkdownBlocks(content);
    const tables = blocks.filter((b) => b.type === 'table');

    expect(tables).toHaveLength(1);
    expect(tables[0]).toEqual({
      type: 'table',
      headers: ['Improvement', 'Effort', 'Impact'],
      rows: [
        ['Event Archiving', 'Low', 'Keeps DB lean'],
        ['Tool Approval State', 'Medium', 'Simplifies async flow'],
      ],
    });
  });
});
