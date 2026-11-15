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
      flexDirection="column"
      borderStyle="round"
      borderColor={Theme.colors.border}
      paddingX={1}
      marginBottom={1}
    >
      <Box justifyContent="space-between">
        <Box>
          <Text color={Theme.colors.accent} bold>
            {Theme.icons.sparkle} EVOLVE
          </Text>
          <Text color={Theme.colors.dim}> | </Text>
          <Text color={Theme.colors.text} bold>
            {projectName}
          </Text>
          {gitBranch && (
            <>
              <Text color={Theme.colors.dim}> (</Text>
              <Text color={Theme.colors.accent}>
                {Theme.icons.git} {gitBranch}
              </Text>
              <Text color={Theme.colors.dim}>)</Text>
            </>
          )}
        </Box>
        <Box>
          <Text color={isOnline ? Theme.colors.success : Theme.colors.warning}>
            {isOnline ? Theme.icons.bullet : Theme.icons.bulletOpen} {model}
          </Text>
        </Box>
      </Box>
      <Box marginTop={0} justifyContent="space-between">
        <Box>
          <Text color={Theme.colors.dim} dimColor>
            Mode: {activeScreen.toUpperCase()} • Type /help for commands • Ctrl+C to cancel/exit
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
