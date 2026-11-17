import React from 'react';
import { Box, Text } from 'ink';
import { Theme } from './Theme.js';

export interface MemoryEntry {
  id: string;
  category: string;
  key: string;
  content: string;
  confidence?: number | undefined;
  sourceType?: string | undefined;
  verificationStatus?: string | undefined;
  accessCount?: number | undefined;
  supersededBy?: string | null | undefined;
  projectId?: string | null | undefined;
}

export interface MemoryListProps {
  memories: MemoryEntry[];
  title?: string;
}

export const MemoryList: React.FC<MemoryListProps> = ({ memories, title }) => {
  if (memories.length === 0) {
    return (
      <Box borderStyle="round" borderColor={Theme.colors.border} paddingX={1} marginY={1}>
        <Text color={Theme.colors.dim}>
          No memories found matching this query or category.
        </Text>
      </Box>
    );
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'verified':
        return Theme.colors.success;
      case 'proposed':
        return Theme.colors.warning;
      case 'deprecated':
        return Theme.colors.dim;
      default:
        return Theme.colors.silver;
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Theme.colors.border}
      paddingX={1}
      marginY={1}
    >
      <Box marginBottom={1}>
        <Text color={Theme.colors.silver} bold>
          {Theme.icons.sparkle} {title ?? 'PERSISTENT MEMORY & EXPERIENCE'} ({memories.length})
        </Text>
      </Box>

      {memories.map((m) => {
        const isUser = !m.projectId;
        const statusColor = getStatusColor(m.verificationStatus);
        return (
          <Box key={m.id} flexDirection="column" marginBottom={1}>
            <Box justifyContent="space-between">
              <Box>
                <Text color={Theme.colors.accent} bold>
                  [{m.category.toUpperCase()}]
                </Text>
                <Text color={Theme.colors.text} bold>
                  {' '}{m.key}
                </Text>
                {isUser && <Text color={Theme.colors.dim}> (global)</Text>}
              </Box>
              <Box>
                {m.verificationStatus && (
                  <Text color={statusColor}>[{m.verificationStatus}]</Text>
                )}
                {m.accessCount !== undefined && m.accessCount > 0 && (
                  <Text color={Theme.colors.dim}> {m.accessCount}x</Text>
                )}
              </Box>
            </Box>
            <Box paddingLeft={2}>
              <Text color={Theme.colors.text}>{m.content}</Text>
            </Box>
            {m.supersededBy && (
              <Box paddingLeft={2}>
                <Text color={Theme.colors.dim}>→ Superseded by {m.supersededBy}</Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
