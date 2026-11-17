import React from 'react';
import { Box, Text } from 'ink';
import { Theme } from './Theme.js';

export interface HeaderProps {
  projectName: string;
  model: string;
  gitBranch?: string | undefined;
  isOnline: boolean;
  activeScreen?: string | undefined;
}

export const Header: React.FC<HeaderProps> = ({
  projectName,
  model,
  gitBranch,
  isOnline,
  activeScreen = 'chat',
}) => {
  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      marginBottom={1}
      paddingBottom={0}
    >
      <Box gap={1}>
        <Text color={Theme.colors.accent} bold>
          EVOLVE
        </Text>
        <Text color={Theme.colors.dim}>{Theme.icons.bar}</Text>
        <Text color={Theme.colors.silver} bold>
          {projectName}
        </Text>
        {gitBranch && (
          <Text color={Theme.colors.dim}>
            ({Theme.icons.git} {gitBranch})
          </Text>
        )}
      </Box>

      <Box gap={1}>
        <Text color={isOnline ? Theme.colors.success : Theme.colors.warning}>
          {isOnline ? Theme.icons.bullet : Theme.icons.bulletOpen}
        </Text>
        <Text color={Theme.colors.dim}>
          {model}
        </Text>
        {activeScreen !== 'chat' && (
          <Text color={Theme.colors.silver} bold>
            [{activeScreen.toUpperCase()}]
          </Text>
        )}
      </Box>
    </Box>
  );
};
