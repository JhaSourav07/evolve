import React from 'react';
import { Box, Text } from 'ink';
import { Theme } from './Theme.js';

export interface IntegrationStatusItem {
  id: string;
  name: string;
  source: string;
  consentGranted: boolean;
  scope: string;
  description: string;
}

export interface IntegrationsListProps {
  items: IntegrationStatusItem[];
}

export const IntegrationsList: React.FC<IntegrationsListProps> = ({ items }) => {
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
          {Theme.icons.sparkle} INTEGRATIONS & CONSENT GOVERNANCE
        </Text>
      </Box>

      {items.map((item) => (
        <Box key={item.id} flexDirection="column" marginBottom={1}>
          <Box justifyContent="space-between">
            <Box>
              <Text color={item.consentGranted ? Theme.colors.success : Theme.colors.warning}>
                {item.consentGranted ? Theme.icons.check : Theme.icons.bulletOpen}{' '}
              </Text>
              <Text color={Theme.colors.text} bold>
                {item.name}
              </Text>
              <Text color={Theme.colors.dim}> ({item.source})</Text>
            </Box>
            <Text color={item.consentGranted ? Theme.colors.success : Theme.colors.dim}>
              {item.consentGranted ? 'CONSENT ACTIVE' : 'DISABLED'}
            </Text>
          </Box>
          <Box paddingLeft={2} flexDirection="column">
            <Text color={Theme.colors.dim}>{item.description}</Text>
            <Text color={Theme.colors.dim}>Scope: {item.scope}</Text>
          </Box>
        </Box>
      ))}

      <Box marginTop={1} borderStyle="single" borderColor={Theme.colors.border} paddingX={1}>
        <Text color={Theme.colors.dim} italic>
          To import external conversations: evolve integrations import &lt;file.json&gt;
        </Text>
      </Box>
    </Box>
  );
};
