import React from 'react';
import { Box, Text } from 'ink';
import { Theme } from './Theme.js';

export interface CodeBlockProps {
  lines: readonly string[];
  lang?: string | undefined;
}

/**
 * Tokenize a single line of code into syntax-highlighted chunks.
 */
function highlightCodeLine(line: string): React.ReactNode {
  const trimmed = line.trim();
  // Comments
  if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
    return (
      <Text color={Theme.colors.dim} italic>
        {line}
      </Text>
    );
  }

  const parts: Array<{ text: string; type: 'keyword' | 'string' | 'number' | 'comment' | 'plain' }> = [];
  let lastIndex = 0;

  // Match strings, keywords, numbers, inline comments
  const codeRegex =
    /("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`|\/\/[^\n]*|#[^\n]*|\b(const|let|var|function|class|interface|type|import|export|from|return|if|else|switch|case|default|for|while|do|break|continue|try|catch|finally|throw|new|async|await|public|private|protected|readonly|def|self|None|True|False|select|from|where|insert|update|delete|fn|pub|impl|struct|enum|match|use|mod|mut)\b|\b\d+(\.\d+)?\b)/g;

  let match: RegExpExecArray | null;
  while ((match = codeRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        text: line.slice(lastIndex, match.index),
        type: 'plain',
      });
    }

    const matchedText = match[0];
    if (matchedText.startsWith('"') || matchedText.startsWith("'") || matchedText.startsWith('`')) {
      parts.push({ text: matchedText, type: 'string' });
    } else if (matchedText.startsWith('//') || matchedText.startsWith('#')) {
      parts.push({ text: matchedText, type: 'comment' });
    } else if (/^\d+(\.\d+)?$/.test(matchedText)) {
      parts.push({ text: matchedText, type: 'number' });
    } else {
      parts.push({ text: matchedText, type: 'keyword' });
    }

    lastIndex = match.index + matchedText.length;
  }

  if (lastIndex < line.length) {
    parts.push({
      text: line.slice(lastIndex),
      type: 'plain',
    });
  }

  if (parts.length === 0) {
    return <Text color={Theme.colors.text}>{line}</Text>;
  }

  return parts.map((part, i) => {
    switch (part.type) {
      case 'keyword':
        return (
          <Text key={i} color={Theme.colors.accent} bold>
            {part.text}
          </Text>
        );
      case 'string':
        return (
          <Text key={i} color={Theme.colors.success}>
            {part.text}
          </Text>
        );
      case 'number':
        return (
          <Text key={i} color={Theme.colors.warning}>
            {part.text}
          </Text>
        );
      case 'comment':
        return (
          <Text key={i} color={Theme.colors.dim} italic>
            {part.text}
          </Text>
        );
      case 'plain':
      default:
        return (
          <Text key={i} color={Theme.colors.text}>
            {part.text}
          </Text>
        );
    }
  });
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ lines, lang }) => {
  const lineCount = lines.length;
  const padWidth = Math.max(2, String(lineCount).length);

  return (
    <Box flexDirection="column" marginY={1} paddingLeft={1}>
      {/* Optional language header */}
      {lang && (
        <Box marginBottom={0}>
          <Text color={Theme.colors.dim} bold>
            {lang.toLowerCase()}
          </Text>
        </Box>
      )}

      {/* Code with line numbers & clean vertical guide */}
      <Box flexDirection="column">
        {lines.map((line, idx) => {
          const lineNum = String(idx + 1).padStart(padWidth, ' ');
          return (
            <Box key={idx}>
              <Text color={Theme.colors.dim} dimColor>
                {lineNum} {Theme.icons.bar}{' '}
              </Text>
              {highlightCodeLine(line)}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
