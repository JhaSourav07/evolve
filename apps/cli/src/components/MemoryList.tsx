import React from 'react';
import { Box, Text } from 'ink';
import { Theme } from './Theme.js';

export interface MemoryEntry {
  id: string;
  category: string;
  key: string;
  content: string;
  confidence?: number;
}

export interface MemoryListProps {
  memories: MemoryEntry[];
}

export const MemoryList: React.FC<MemoryListProps> = ({ memories }) => {
  if (memories.length === 0) {
    return (
      <Box borderStyle="round" borderColor={Theme.colors.border} paddingX={1} marginY={1}>
        <Text color={Theme.colors.dim}>
          No memories stored yet. As you rate and correct Evolve, memories will appear here.
        </Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Theme.colors.border}
      paddingX={1}
      marginY={1}
    >
      <Box marginBottom={1}>
        <Text color={Theme.colors.accent} bold>
          {Theme.icons.sparkle} PROJECT MEMORY & KNOWLEDGE ({memories.length})
        </Text>
      </Box>

      {memories.map((m) => (
        <Box key={m.id} flexDirection="column" marginBottom={1}>
          <Box>
            <Text color={Theme.colors.accent} bold>
              [{m.category.toUpperCase()}] {m.key}
            </Text>
          </Box>
          <Box paddingLeft={2}>
            <Text color={Theme.colors.text}>{m.content}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
};
