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
      borderStyle="round"
      borderColor={Theme.colors.border}
      paddingX={1}
      marginY={1}
    >
      <Box marginBottom={1}>
        <Text color={Theme.colors.accent} bold>
          {Theme.icons.sparkle} EVOLVE SYSTEM STATUS
        </Text>
      </Box>

      {/* Project & Environment */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={Theme.colors.text} bold underline>
          Workspace
        </Text>
        <Box paddingLeft={2} flexDirection="column">
          <Text color={Theme.colors.text}>
            Project: <Text color={Theme.colors.accent}>{status.projectName}</Text> (
            {status.projectId})
          </Text>
          <Text color={Theme.colors.dim}>Root: {status.rootDir}</Text>
          {status.gitBranch && (
            <Text color={Theme.colors.text}>
              Git:{' '}
              <Text color={Theme.colors.accent}>
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
        <Text color={Theme.colors.text} bold underline>
          Model & Inference
        </Text>
        <Box paddingLeft={2} flexDirection="column">
          <Text color={Theme.colors.text}>
            Provider: <Text color={Theme.colors.accent}>{status.provider}</Text>
          </Text>
          <Text color={Theme.colors.text}>
            Model: <Text color={Theme.colors.accent}>{status.model}</Text>
            <Text color={status.isOnline ? Theme.colors.success : Theme.colors.error}>
              {' '}
              {status.isOnline
                ? `${Theme.icons.bullet} Online & Responsive`
                : `${Theme.icons.bulletOpen} Offline`}
            </Text>
          </Text>
        </Box>
      </Box>

      {/* Memory & Database */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={Theme.colors.text} bold underline>
          Storage & Memory Engine
        </Text>
        <Box paddingLeft={2} flexDirection="column">
          <Text color={Theme.colors.text}>
            Active Session: <Text color={Theme.colors.dim}>{status.sessionId}</Text>
          </Text>
          <Text color={Theme.colors.text}>
            Database: <Text color={Theme.colors.dim}>{status.dbPath}</Text>
          </Text>
          <Text color={Theme.colors.text}>
            Historical Sessions: <Text color={Theme.colors.accent}>{status.sessionCount}</Text> •
            Indexed Memories: <Text color={Theme.colors.accent}>{status.memoryCount}</Text>
          </Text>
        </Box>
      </Box>

      {/* Integrations & Consent */}
      <Box flexDirection="column">
        <Text color={Theme.colors.text} bold underline>
          Integrations & Consent
        </Text>
        <Box paddingLeft={2}>
          <Text color={status.integrations.terminal ? Theme.colors.success : Theme.colors.dim}>
            Terminal: {status.integrations.terminal ? Theme.icons.check : Theme.icons.cross}
          </Text>
          <Text color={Theme.colors.dim}> | </Text>
          <Text color={status.integrations.vscode ? Theme.colors.success : Theme.colors.dim}>
            VS Code: {status.integrations.vscode ? Theme.icons.check : Theme.icons.cross}
          </Text>
          <Text color={Theme.colors.dim}> | </Text>
          <Text color={status.integrations.pi ? Theme.colors.success : Theme.colors.dim}>
            Pi: {status.integrations.pi ? Theme.icons.check : Theme.icons.cross}
          </Text>
          <Text color={Theme.colors.dim}> | </Text>
          <Text color={status.integrations.claude ? Theme.colors.success : Theme.colors.dim}>
            Claude: {status.integrations.claude ? Theme.icons.check : Theme.icons.cross}
          </Text>
          <Text color={Theme.colors.dim}> | </Text>
          <Text color={status.integrations.gemini ? Theme.colors.success : Theme.colors.dim}>
            Gemini: {status.integrations.gemini ? Theme.icons.check : Theme.icons.cross}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
