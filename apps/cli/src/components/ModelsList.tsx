import React from 'react';
import { Box, Text } from 'ink';
import { Theme } from './Theme.js';

export interface ModelItem {
  name: string;
  size?: string | undefined;
  modifiedAt?: string | undefined;
  isActive: boolean;
}

export interface ModelsListProps {
  models: ModelItem[];
  isOnline: boolean;
  providerUrl: string;
}

export const ModelsList: React.FC<ModelsListProps> = ({ models, isOnline, providerUrl }) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Theme.colors.border}
      paddingX={1}
      marginY={1}
    >
      <Box marginBottom={1} justifyContent="space-between">
        <Text color={Theme.colors.accent} bold>
          {Theme.icons.sparkle} DISCOVERED OLLAMA MODELS
        </Text>
        <Text color={isOnline ? Theme.colors.success : Theme.colors.error}>
          {isOnline
            ? `${Theme.icons.bullet} Connected (${providerUrl})`
            : `${Theme.icons.bulletOpen} Offline`}
        </Text>
      </Box>

      {models.length === 0 ? (
        <Box paddingLeft={2} marginY={1}>
          <Text color={Theme.colors.warning}>
            No local Ollama models found. Run `ollama pull qwen2.5-coder:7b` to install a coding
            model.
          </Text>
        </Box>
      ) : (
        models.map((m) => (
          <Box key={m.name} justifyContent="space-between" marginY={0}>
            <Box>
              <Text color={m.isActive ? Theme.colors.success : Theme.colors.dim}>
                {m.isActive ? '● ' : '  '}
              </Text>
              <Text color={m.isActive ? Theme.colors.accent : Theme.colors.text} bold={m.isActive}>
                {m.name}
              </Text>
              {m.isActive && <Text color={Theme.colors.success}> (active)</Text>}
            </Box>
            <Box>{m.size && <Text color={Theme.colors.dim}>{m.size} </Text>}</Box>
          </Box>
        ))
      )}
    </Box>
  );
};
