import React from 'react';
import { Box, Text } from 'ink';
import { Theme } from './Theme.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'system' | 'error';
  content: string;
  timestamp: number;
  toolName?: string | undefined;
  toolArgs?: Record<string, unknown> | undefined;
  toolSuccess?: boolean | undefined;
  toolDurationMs?: number | undefined;
  recoveryHint?: string | undefined;
}

export interface MessageItemProps {
  message: ChatMessage;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
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

    case 'assistant':
      return (
        <Box flexDirection="column" marginY={1}>
          <Box>
            <Text color={Theme.colors.accent} bold>
              {Theme.icons.sparkle} Evolve
            </Text>
          </Box>
          <Box paddingLeft={2}>
            <Text color={Theme.colors.assistant}>{message.content}</Text>
          </Box>
        </Box>
      );

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
