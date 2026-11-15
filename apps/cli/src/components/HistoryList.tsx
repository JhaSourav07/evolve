import React from 'react';
import { Box, Text } from 'ink';
import { Theme } from './Theme.js';

export interface SessionSummary {
  id: string;
  goal: string;
  status: string;
  createdAt: number;
}

export interface HistoryListProps {
  sessions: SessionSummary[];
}

export const HistoryList: React.FC<HistoryListProps> = ({ sessions }) => {
  if (sessions.length === 0) {
    return (
      <Box borderStyle="round" borderColor={Theme.colors.border} paddingX={1} marginY={1}>
        <Text color={Theme.colors.dim}>No previous sessions recorded in this project.</Text>
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
          {Theme.icons.sparkle} SESSION HISTORY ({sessions.length})
        </Text>
      </Box>

      {sessions.map((sess) => {
        const dateStr = new Date(sess.createdAt).toLocaleString();
        const isCompleted = sess.status === 'completed';
        return (
          <Box key={sess.id} flexDirection="column" marginY={0}>
            <Box justifyContent="space-between">
              <Box>
                <Text color={isCompleted ? Theme.colors.success : Theme.colors.warning}>
                  {isCompleted ? Theme.icons.check : Theme.icons.bullet}{' '}
                </Text>
                <Text color={Theme.colors.text} bold>
                  {sess.goal}
                </Text>
              </Box>
              <Text color={Theme.colors.dim}>{dateStr}</Text>
            </Box>
            <Box paddingLeft={2} marginBottom={1}>
              <Text color={Theme.colors.dim}>
                ID: {sess.id} • Status: {sess.status}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
