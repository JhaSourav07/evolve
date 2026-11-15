import React from 'react';
import { Box, Text } from 'ink';
import { Theme } from './Theme.js';

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

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isThinkingExpanded = false,
}) => {
  switch (message.role) {
    case 'user':
      return (
        <Box flexDirection="column" marginY={1}>
          <Box>
            <Text color={Theme.colors.user} bold>
              {Theme.icons.bullet} You
            </Text>
          </Box>
          <Box paddingLeft={2}>
            <Text color={Theme.colors.text}>{message.content}</Text>
          </Box>
        </Box>
      );

    case 'assistant': {
      const lineCount = message.thinking ? message.thinking.split('\n').length : 0;
      return (
        <Box flexDirection="column" marginY={1}>
          <Box>
            <Text color={Theme.colors.accent} bold>
              {Theme.icons.sparkle} Evolve
            </Text>
          </Box>

          {/* Collapsible Thinking Process Block */}
          {message.thinking && message.thinking.trim().length > 0 && (
            <Box marginY={0} paddingLeft={2} flexDirection="column">
              {isThinkingExpanded ? (
                <Box
                  flexDirection="column"
                  borderStyle="single"
                  borderColor={Theme.colors.border}
                  paddingX={1}
                  paddingY={0}
                  marginY={0}
                >
                  <Box justifyContent="space-between">
                    <Text color={Theme.colors.accent} bold>
                      💭 Thought Process ({lineCount} lines)
                    </Text>
                    <Text color={Theme.colors.dim} dimColor>
                      Ctrl+O to collapse
                    </Text>
                  </Box>
                  <Box marginTop={0}>
                    <Text color={Theme.colors.dim} italic>
                      {message.thinking}
                    </Text>
                  </Box>
                </Box>
              ) : (
                <Text color={Theme.colors.dim} italic>
                  💭 Thought process ({lineCount} lines hidden • Ctrl+O to expand)
                </Text>
              )}
            </Box>
          )}

          <Box paddingLeft={2} marginTop={message.thinking ? 1 : 0}>
            <Text color={Theme.colors.assistant}>{message.content}</Text>
          </Box>
        </Box>
      );
    }

    case 'tool_call':
      return (
        <Box paddingLeft={2} marginY={0}>
          <Text color={Theme.colors.tool}>
            {Theme.icons.tool} {message.toolName}
          </Text>
          {message.toolArgs && (
            <Text color={Theme.colors.dim}>
              {' '}
              (
              {Object.entries(message.toolArgs)
                .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                .join(', ')}
              )
            </Text>
          )}
        </Box>
      );

    case 'tool_result': {
      const isSuccess = message.toolSuccess ?? true;
      const duration = message.toolDurationMs ? ` (${message.toolDurationMs}ms)` : '';
      const lines = message.content ? message.content.trim().split('\n') : [];
      const lineCount = lines.length;
      const isMultiLine = lineCount > 1 || message.content.length > 80;

      if (!isMultiLine) {
        return (
          <Box paddingLeft={4} marginY={0}>
            <Text color={isSuccess ? Theme.colors.success : Theme.colors.error}>
              {isSuccess ? Theme.icons.check : Theme.icons.cross}
            </Text>
            <Text color={Theme.colors.dim}>
              {' '}
              {isSuccess ? 'Completed' : 'Failed'}
              {duration}: {message.content}
            </Text>
          </Box>
        );
      }

      // Multi-line output (like read_file, list_files, run_command)
      // When collapsed: show compact summary with line/item count and Ctrl+O hint
      if (!isThinkingExpanded) {
        const countLabel =
          message.toolName === 'list_files' ? `${lineCount} items` : `${lineCount} lines`;
        return (
          <Box paddingLeft={4} marginY={0}>
            <Text color={isSuccess ? Theme.colors.success : Theme.colors.error}>
              {isSuccess ? Theme.icons.check : Theme.icons.cross}
            </Text>
            <Text color={Theme.colors.dim}>
              {' '}
              {isSuccess ? 'Completed' : 'Failed'}
              {duration} ({countLabel} hidden • Ctrl+O to expand)
            </Text>
          </Box>
        );
      }

      // When expanded (isThinkingExpanded === true): show full content in a bordered box
      return (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={Theme.colors.border}
          paddingX={1}
          paddingY={0}
          marginLeft={4}
          marginY={0}
        >
          <Box justifyContent="space-between">
            <Text color={isSuccess ? Theme.colors.success : Theme.colors.error} bold>
              {isSuccess ? Theme.icons.check : Theme.icons.cross} {message.toolName || 'Tool'}{' '}
              Output ({lineCount} lines){duration}
            </Text>
            <Text color={Theme.colors.dim} dimColor>
              Ctrl+O to collapse
            </Text>
          </Box>
          <Box marginTop={0}>
            <Text color={Theme.colors.dim}>{message.content}</Text>
          </Box>
        </Box>
      );
    }

    case 'error':
      return (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={Theme.colors.error}
          paddingX={1}
          marginY={1}
        >
          <Text color={Theme.colors.error} bold>
            {Theme.icons.cross} Error: {message.content}
          </Text>
          {message.recoveryHint && (
            <Text color={Theme.colors.warning}>Recovery Suggestion: {message.recoveryHint}</Text>
          )}
        </Box>
      );

    case 'system':
    default:
      return (
        <Box paddingLeft={2} marginY={0}>
          <Text color={Theme.colors.dim} italic>
            {message.content}
          </Text>
        </Box>
      );
  }
};
