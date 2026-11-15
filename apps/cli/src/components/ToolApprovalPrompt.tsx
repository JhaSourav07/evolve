import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Theme } from './Theme.js';

export interface ToolApprovalPromptProps {
  toolName: string;
  parameters: Record<string, unknown>;
  onApprove: () => void;
  onReject: (reason?: string) => void;
  onCancel: () => void;
}

export const ToolApprovalPrompt: React.FC<ToolApprovalPromptProps> = ({
  toolName,
  parameters,
  onApprove,
  onReject,
  onCancel,
}) => {
  useInput((input, key) => {
    if (input.toLowerCase() === 'y' || key.return) {
      onApprove();
    } else if (input.toLowerCase() === 'n') {
      onReject('User rejected action');
    } else if (input.toLowerCase() === 'c' || key.escape) {
      onCancel();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Theme.colors.warning}
      paddingX={1}
      marginY={1}
    >
      <Box>
        <Text color={Theme.colors.warning} bold>
          {Theme.icons.shield} Action Requires Approval:
        </Text>
        <Text color={Theme.colors.text} bold>
          {' '}
          {toolName}
        </Text>
      </Box>

      <Box paddingLeft={2} marginY={1} flexDirection="column">
        {Object.entries(parameters).map(([key, value]) => (
          <Box key={key}>
            <Text color={Theme.colors.accent}>{key}: </Text>
            <Text color={Theme.colors.text}>
              {typeof value === 'string' ? value : JSON.stringify(value)}
            </Text>
          </Box>
        ))}
      </Box>

      <Box>
        <Text color={Theme.colors.dim}>Press </Text>
        <Text color={Theme.colors.success} bold>
          [Y] Approve
        </Text>
        <Text color={Theme.colors.dim}> • </Text>
        <Text color={Theme.colors.error} bold>
          [N] Reject
        </Text>
        <Text color={Theme.colors.dim}> • </Text>
        <Text color={Theme.colors.dim} bold>
          [C] Cancel
        </Text>
      </Box>
    </Box>
  );
};
