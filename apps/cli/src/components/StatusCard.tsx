import React from 'react';
import { Box, Text } from 'ink';
import { Theme } from './Theme.js';

export interface StatusData {
  projectName: string;
  projectId: string;
  rootDir: string;
  gitBranch?: string | undefined;
  gitClean?: boolean | undefined;
  provider: string;
  model: string;
  isOnline: boolean;
  sessionId: string;
  sessionCount: number;
  memoryCount: number;
  integrations: {
    terminal: boolean;
    vscode: boolean;
    pi: boolean;
    claude: boolean;
    gemini: boolean;
  };
  dbPath: string;
}

export interface StatusCardProps {
  status: StatusData;
}

export const StatusCard: React.FC<StatusCardProps> = ({ status }) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={Theme.colors.border}
      paddingX={1}
      marginY={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color={Theme.colors.accent} bold>
          EVOLVE SYSTEM STATUS
        </Text>
        <Text color={Theme.colors.dim}>[Esc] Back to chat</Text>
      </Box>

      {/* Project & Environment */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={Theme.colors.silver} bold>
          Workspace
        </Text>
        <Box paddingLeft={2} flexDirection="column">
          <Text color={Theme.colors.text}>
            Project: <Text color={Theme.colors.accent}>{status.projectName}</Text> ({status.projectId})
          </Text>
          <Text color={Theme.colors.dim}>Root: {status.rootDir}</Text>
          {status.gitBranch && (
            <Text color={Theme.colors.text}>
              Git:{' '}
              <Text color={Theme.colors.silver}>
                {Theme.icons.git} {status.gitBranch}
              </Text>
              <Text color={status.gitClean ? Theme.colors.success : Theme.colors.warning}>
                {' '}
                ({status.gitClean ? 'clean working tree' : 'modified files'})
              </Text>
            </Text>
          )}
        </Box>
      </Box>

      {/* Model & Provider */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={Theme.colors.silver} bold>
          Model & Inference
        </Text>
        <Box paddingLeft={2} flexDirection="column">
          <Text color={Theme.colors.text}>
            Provider: <Text color={Theme.colors.accent}>{status.provider}</Text>
          </Text>
          <Text color={Theme.colors.text}>
            Model: <Text color={Theme.colors.accent}>{status.model}</Text>{' '}
            <Text color={status.isOnline ? Theme.colors.success : Theme.colors.error}>
              ({status.isOnline ? 'Online' : 'Offline'})
            </Text>
          </Text>
        </Box>
      </Box>

      {/* Memory & Database */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={Theme.colors.silver} bold>
          Storage & Memory
        </Text>
        <Box paddingLeft={2} flexDirection="column">
          <Text color={Theme.colors.dim}>Session: {status.sessionId}</Text>
          <Text color={Theme.colors.dim}>Database: {status.dbPath}</Text>
          <Text color={Theme.colors.text}>
            Sessions: <Text color={Theme.colors.silver}>{status.sessionCount}</Text> • Memories:{' '}
            <Text color={Theme.colors.silver}>{status.memoryCount}</Text>
          </Text>
        </Box>
      </Box>

      {/* Integrations & Consent */}
      <Box flexDirection="column">
        <Text color={Theme.colors.silver} bold>
          Integrations
        </Text>
        <Box paddingLeft={2} gap={2}>
          <Text color={status.integrations.terminal ? Theme.colors.success : Theme.colors.dim}>
            Terminal: {status.integrations.terminal ? Theme.icons.check : Theme.icons.cross}
          </Text>
          <Text color={status.integrations.vscode ? Theme.colors.success : Theme.colors.dim}>
            VS Code: {status.integrations.vscode ? Theme.icons.check : Theme.icons.cross}
          </Text>
          <Text color={status.integrations.claude ? Theme.colors.success : Theme.colors.dim}>
            Claude: {status.integrations.claude ? Theme.icons.check : Theme.icons.cross}
          </Text>
          <Text color={status.integrations.gemini ? Theme.colors.success : Theme.colors.dim}>
            Gemini: {status.integrations.gemini ? Theme.icons.check : Theme.icons.cross}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
