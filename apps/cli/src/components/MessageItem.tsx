import React from 'react';
import { Box, Text } from 'ink';
import { Theme } from './Theme.js';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import { ToolExecution } from './ToolExecution.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'system' | 'error';
  content: string;
  thinking?: string | undefined;
  timestamp: number;
  toolName?: string | undefined;
  toolArgs?: Record<string, unknown> | undefined;
  toolSuccess?: boolean | undefined;
  toolDurationMs?: number | undefined;
  recoveryHint?: string | undefined;
}

export interface MessageItemProps {
  message: ChatMessage;
  isThinkingExpanded?: boolean | undefined;
}

export const MessageItem: React.FC<MessageItemProps> = React.memo(({
  message,
  isThinkingExpanded = false,
}) => {
  switch (message.role) {
    case 'user':
      return (
        <Box flexDirection="column" marginY={1}>
          <Box>
            <Text color={Theme.colors.user} bold>
              {Theme.icons.prompt}{' '}
            </Text>
            <Text color={Theme.colors.user} bold>
              {message.content}
            </Text>
          </Box>
        </Box>
      );

    case 'assistant': {
      const lineCount = message.thinking ? message.thinking.split('\n').length : 0;
      return (
        <Box flexDirection="column" marginY={1}>
          {/* Collapsible Thinking Process */}
          {message.thinking && message.thinking.trim().length > 0 && (
            <Box marginY={0} paddingLeft={2} flexDirection="column">
              {isThinkingExpanded ? (
                <Box flexDirection="column" marginY={0}>
                  <Box>
                    <Text color={Theme.colors.dim} bold>
                      Thinking ({lineCount} lines • Ctrl+O to collapse):
                    </Text>
                  </Box>
                  <Box flexDirection="column" paddingLeft={1} marginTop={0}>
                    {message.thinking.split('\n').map((line, idx) => (
                      <Box key={idx}>
                        <Text color={Theme.colors.dim} dimColor>
                          {Theme.icons.bar}{' '}
                        </Text>
                        <Text color={Theme.colors.dim} italic>
                          {line}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ) : (
                <Text color={Theme.colors.dim} dimColor>
                  Thinking ({lineCount} lines • Ctrl+O to expand)
                </Text>
              )}
            </Box>
          )}

          {/* Formatted Markdown Content */}
          <Box paddingLeft={message.thinking ? 2 : 0} marginTop={message.thinking ? 1 : 0}>
            <MarkdownRenderer content={message.content} />
          </Box>
        </Box>
      );
    }

    case 'tool_call':
      return (
        <ToolExecution
          toolName={message.toolName ?? 'tool'}
          args={message.toolArgs}
          status="running"
          isExpanded={isThinkingExpanded}
        />
      );

    case 'tool_result':
      return (
        <ToolExecution
          toolName={message.toolName ?? 'tool'}
          status={message.toolSuccess === false ? 'failed' : 'completed'}
          output={message.toolSuccess === false ? undefined : message.content}
          error={message.toolSuccess === false ? message.content : undefined}
          durationMs={message.toolDurationMs}
          isExpanded={isThinkingExpanded}
        />
      );

    case 'error':
      return (
        <Box flexDirection="column" marginY={1} paddingLeft={1}>
          <Box>
            <Text color={Theme.colors.error} bold>
              {Theme.icons.cross} Error: {message.content}
            </Text>
          </Box>
          {message.recoveryHint && (
            <Box paddingLeft={2}>
              <Text color={Theme.colors.dim}>Suggestion: {message.recoveryHint}</Text>
            </Box>
          )}
        </Box>
      );

    case 'system':
    default:
      return (
        <Box paddingLeft={1} marginY={0}>
          <Text color={Theme.colors.dim}>
            {Theme.icons.bulletOpen} {message.content}
          </Text>
        </Box>
      );
  }
});

MessageItem.displayName = 'MessageItem';
