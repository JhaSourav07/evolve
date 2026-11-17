import React from 'react';
import { Box, Text } from 'ink';
import { Theme } from './Theme.js';
import { CodeBlock } from './CodeBlock.js';

interface MarkdownRendererProps {
  content: string;
}

/**
 * Tokenizes inline markdown: **bold**, *italic*, `code`, [link](url), and plain text.
 */
export interface InlineToken {
  type: 'text' | 'bold' | 'italic' | 'code' | 'link';
  text: string;
  url?: string;
}

export function parseInlineTokens(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let remaining = line;

  const inlineRegex =
    /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(_([^_]+)_)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/;

  while (remaining.length > 0) {
    const match = remaining.match(inlineRegex);
    if (!match || match.index === undefined) {
      tokens.push({ type: 'text', text: remaining });
      break;
    }

    if (match.index > 0) {
      tokens.push({ type: 'text', text: remaining.slice(0, match.index) });
    }

    if (match[2] !== undefined) {
      tokens.push({ type: 'bold', text: match[2] });
    } else if (match[4] !== undefined) {
      tokens.push({ type: 'italic', text: match[4] });
    } else if (match[6] !== undefined) {
      tokens.push({ type: 'italic', text: match[6] });
    } else if (match[8] !== undefined) {
      tokens.push({ type: 'code', text: match[8] });
    } else if (match[10] !== undefined && match[11] !== undefined) {
      tokens.push({ type: 'link', text: match[10], url: match[11] });
    }

    remaining = remaining.slice(match.index + match[0].length);
  }

  return tokens;
}

export const FormattedInline: React.FC<{ text: string }> = ({ text }) => {
  const tokens = parseInlineTokens(text);

  return (
    <Text color={Theme.colors.assistant}>
      {tokens.map((token, idx) => {
        switch (token.type) {
          case 'bold':
            return (
              <Text key={idx} bold color={Theme.colors.text}>
                {token.text}
              </Text>
            );
          case 'italic':
            return (
              <Text key={idx} italic color={Theme.colors.dim}>
                {token.text}
              </Text>
            );
          case 'code':
            return (
              <Text key={idx} color={Theme.colors.silver} bold>
                `{token.text}`
              </Text>
            );
          case 'link':
            return (
              <Text key={idx} color={Theme.colors.silver} underline>
                {token.text}
              </Text>
            );
          case 'text':
          default:
            return <Text key={idx}>{token.text}</Text>;
        }
      })}
    </Text>
  );
};

/**
 * Markdown block types for structured rendering.
 */
export type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'code_block'; lang: string; lines: string[] }
  | { type: 'horizontal_rule' }
  | { type: 'blockquote'; text: string }
  | { type: 'bullet_item'; indent: number; text: string }
  | { type: 'numbered_item'; indent: number; number: string; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'paragraph'; text: string }
  | { type: 'blank' };

export function parseMarkdownBlocks(rawContent: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = rawContent.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i] ?? '';
    const trimmed = rawLine.trim();

    // 1. Code blocks: ```lang ... ```
    if (trimmed.startsWith('```')) {
      const lang = trimmed.replace(/^```/, '').trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]?.trim().startsWith('```')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'code_block', lang, lines: codeLines });
      continue;
    }

    // 2. Blank line
    if (!trimmed) {
      blocks.push({ type: 'blank' });
      i++;
      continue;
    }

    // 3. Horizontal Rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'horizontal_rule' });
      i++;
      continue;
    }

    // 4. Headings: #, ##, ###, ####
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // 5. Blockquote: > text
    if (trimmed.startsWith('>')) {
      const quoteText = trimmed.replace(/^>\s*/, '');
      blocks.push({ type: 'blockquote', text: quoteText });
      i++;
      continue;
    }

    // 6. Markdown Table: starts with | and contains |
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length > 2) {
      const tableLines: string[] = [];
      while (
        i < lines.length &&
        lines[i]!.trim().startsWith('|') &&
        lines[i]!.trim().endsWith('|')
      ) {
        tableLines.push(lines[i]!.trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const headerRow = tableLines[0]!
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        const dataRows = tableLines
          .slice(2)
          .map((row) =>
            row
              .slice(1, -1)
              .split('|')
              .map((c) => c.trim()),
          );

        blocks.push({ type: 'table', headers: headerRow, rows: dataRows });
        continue;
      }
    }

    // 7. Bullet lists: - item, * item, + item
    const bulletMatch = rawLine.match(/^(\s*)([-*+])\s+(.+)$/);
    if (bulletMatch && bulletMatch[1] !== undefined && bulletMatch[3]) {
      const indent = Math.floor(bulletMatch[1].length / 2);
      blocks.push({
        type: 'bullet_item',
        indent,
        text: bulletMatch[3].trim(),
      });
      i++;
      continue;
    }

    // 8. Numbered lists: 1. item
    const numberedMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (numberedMatch && numberedMatch[1] !== undefined && numberedMatch[2] && numberedMatch[3]) {
      const indent = Math.floor(numberedMatch[1].length / 2);
      blocks.push({
        type: 'numbered_item',
        indent,
        number: numberedMatch[2],
        text: numberedMatch[3].trim(),
      });
      i++;
      continue;
    }

    // 9. Default Paragraph
    blocks.push({ type: 'paragraph', text: rawLine });
    i++;
  }

  return blocks;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  if (!content || content.trim().length === 0) {
    return null;
  }

  const blocks = parseMarkdownBlocks(content);

  return (
    <Box flexDirection="column" marginY={0}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading': {
            if (block.level === 1) {
              return (
                <Box key={index} flexDirection="column" marginTop={1} marginBottom={1}>
                  <Text color={Theme.colors.accent} bold>
                    {block.text.toUpperCase()}
                  </Text>
                  <Text color={Theme.colors.border}>
                    {'─'.repeat(Math.min(60, block.text.length + 4))}
                  </Text>
                </Box>
              );
            }
            if (block.level === 2) {
              return (
                <Box key={index} flexDirection="column" marginTop={1} marginBottom={0}>
                  <Text color={Theme.colors.silver} bold>
                    ## {block.text}
                  </Text>
                </Box>
              );
            }
            if (block.level === 3) {
              return (
                <Box key={index} marginTop={1} marginBottom={0}>
                  <Text color={Theme.colors.text} bold>
                    ### {block.text}
                  </Text>
                </Box>
              );
            }
            return (
              <Box key={index} marginTop={0} marginBottom={0}>
                <Text color={Theme.colors.dim} bold>
                  {block.text}
                </Text>
              </Box>
            );
          }

          case 'code_block':
            return <CodeBlock key={index} lines={block.lines} lang={block.lang} />;

          case 'horizontal_rule':
            return (
              <Box key={index} marginY={1}>
                <Text color={Theme.colors.border}>{'─'.repeat(50)}</Text>
              </Box>
            );

          case 'blockquote':
            return (
              <Box
                key={index}
                borderStyle="single"
                borderLeft={true}
                borderRight={false}
                borderTop={false}
                borderBottom={false}
                borderColor={Theme.colors.dim}
                paddingLeft={1}
                marginY={0}
              >
                <FormattedInline text={block.text} />
              </Box>
            );

          case 'bullet_item':
            return (
              <Box key={index} paddingLeft={block.indent * 2 + 1} marginY={0}>
                <Text color={Theme.colors.dim}>• </Text>
                <FormattedInline text={block.text} />
              </Box>
            );

          case 'numbered_item':
            return (
              <Box key={index} paddingLeft={block.indent * 2 + 1} marginY={0}>
                <Text color={Theme.colors.dim}>
                  {block.number}.{' '}
                </Text>
                <FormattedInline text={block.text} />
              </Box>
            );

          case 'table': {
            const numCols = block.headers.length;
            const colWidths = block.headers.map((h) => Math.min(30, Math.max(h.length, 6)));

            for (const row of block.rows) {
              row.forEach((cell, cIdx) => {
                if (cIdx < numCols) {
                  colWidths[cIdx] = Math.min(
                    35,
                    Math.max(colWidths[cIdx] ?? 6, cell.length),
                  );
                }
              });
            }

            return (
              <Box key={index} flexDirection="column" marginY={1} paddingLeft={1}>
                {/* Header row */}
                <Box>
                  {block.headers.map((header, hIdx) => {
                    const width = (colWidths[hIdx] ?? 10) + 2;
                    return (
                      <Box key={hIdx} width={width}>
                        <Text color={Theme.colors.silver} bold>
                          {header}
                        </Text>
                      </Box>
                    );
                  })}
                </Box>

                {/* Separator row */}
                <Box>
                  {colWidths.map((w, sIdx) => (
                    <Box key={sIdx} width={w + 2}>
                      <Text color={Theme.colors.border}>{'─'.repeat(w)}</Text>
                    </Box>
                  ))}
                </Box>

                {/* Data rows */}
                {block.rows.map((row, rIdx) => (
                  <Box key={rIdx}>
                    {row.map((cell, cIdx) => {
                      const width = (colWidths[cIdx] ?? 10) + 2;
                      return (
                        <Box key={cIdx} width={width}>
                          <Text color={Theme.colors.assistant}>{cell}</Text>
                        </Box>
                      );
                    })}
                  </Box>
                ))}
              </Box>
            );
          }

          case 'blank':
            return <Box key={index} height={1} />;

          case 'paragraph':
          default:
            return (
              <Box key={index} marginY={0}>
                <FormattedInline text={block.text} />
              </Box>
            );
        }
      })}
    </Box>
  );
};
