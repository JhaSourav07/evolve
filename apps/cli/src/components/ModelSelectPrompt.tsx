import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Theme } from './Theme.js';

export interface ModelOption {
  name: string;
  size?: string | undefined;
  parameterSize?: string | undefined;
  quantizationLevel?: string | undefined;
}

export interface ModelSelectPromptProps {
  models: readonly ModelOption[];
  isOnline: boolean;
  providerUrl: string;
  onSelect: (modelName: string) => void;
  onCancel?: () => void;
  onRetry?: () => void;
  currentModel?: string | undefined;
}

export const ModelSelectPrompt: React.FC<ModelSelectPromptProps> = ({
  models,
  isOnline,
  providerUrl,
  onSelect,
  onCancel,
  onRetry,
  currentModel,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (currentModel) {
      const idx = models.findIndex((m) => m.name === currentModel);
      if (idx >= 0) return idx;
    }
    return 0;
  });
  const [typedInput, setTypedInput] = useState('');

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      if (onCancel) onCancel();
      return;
    }

    if (!isOnline || models.length === 0) {
      if (input.toLowerCase() === 'r' && onRetry) {
        onRetry();
      } else if (input.toLowerCase() === 'q' && onCancel) {
        onCancel();
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : models.length - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < models.length - 1 ? prev + 1 : 0));
      return;
    }

    if (key.return) {
      const trimmed = typedInput.trim();
      if (trimmed.length > 0) {
        // Check if numeric choice
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= models.length) {
          const selected = models[num - 1];
          if (selected) {
            onSelect(selected.name);
            return;
          }
        }
        // Check exact or partial name match
        const matched = models.find(
          (m) =>
            m.name.toLowerCase() === trimmed.toLowerCase() ||
            m.name.toLowerCase().includes(trimmed.toLowerCase()),
        );
        if (matched) {
          onSelect(matched.name);
          return;
        }
      }

      // Default to highlighted item
      const chosen = models[selectedIndex];
      if (chosen) {
        onSelect(chosen.name);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setTypedInput((prev) => prev.slice(0, -1));
      return;
    }

    // Direct digit 1-9 quick-select
    const digit = parseInt(input, 10);
    if (!isNaN(digit) && digit >= 1 && digit <= models.length) {
      const direct = models[digit - 1];
      if (direct) {
        onSelect(direct.name);
        return;
      }
    }

    if (input && input.length === 1 && !key.ctrl && !key.meta) {
      setTypedInput((prev) => prev + input);
    }
  });

  if (!isOnline) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={Theme.colors.error}
        paddingX={2}
        paddingY={1}
        marginY={1}
      >
        <Text bold color={Theme.colors.error}>
          {Theme.icons.cross} Ollama is not reachable at {providerUrl}
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={Theme.colors.text}>Please ensure Ollama is installed and running:</Text>
          <Text color={Theme.colors.accent} bold>
            {'  '}$ ollama serve
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={Theme.colors.dim}>Press [r] to retry connectivity or [q] to exit.</Text>
        </Box>
      </Box>
    );
  }

  if (models.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={Theme.colors.warning}
        paddingX={2}
        paddingY={1}
        marginY={1}
      >
        <Text bold color={Theme.colors.warning}>
          {Theme.icons.bullet} No models found on local Ollama server ({providerUrl})
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={Theme.colors.text}>Please pull a model first. Recommended models:</Text>
          <Text color={Theme.colors.accent} bold>
            {'  '}$ ollama pull qwen3.5:9b
          </Text>
          <Text color={Theme.colors.accent} bold>
            {'  '}$ ollama pull qwen2.5-coder:7b
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={Theme.colors.dim}>Press [r] to refresh or [q] to exit.</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Theme.colors.accent}
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Box gap={1} marginBottom={1}>
        <Text bold color={Theme.colors.accent}>
          {Theme.icons.sparkle} Select an Ollama model to use for this session:
        </Text>
      </Box>

      <Box flexDirection="column" marginY={1}>
        {models.map((m, idx) => {
          const isSelected = idx === selectedIndex;
          const isCurrent = m.name === currentModel;
          return (
            <Box key={m.name} gap={1}>
              <Text color={isSelected ? Theme.colors.accent : Theme.colors.dim} bold>
                {isSelected ? '❯' : ' '} [{idx + 1}]
              </Text>
              <Text bold={isSelected} color={isSelected ? Theme.colors.accent : Theme.colors.text}>
                {m.name}
              </Text>
              {m.parameterSize && <Text color={Theme.colors.dim}>({m.parameterSize})</Text>}
              {m.quantizationLevel && <Text color={Theme.colors.dim}>[{m.quantizationLevel}]</Text>}
              {isCurrent && (
                <Text color={Theme.colors.success} italic>
                  (current)
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={Theme.colors.dim}>
          Use [↑/↓] arrows or type [1-{models.length}] then Enter (Default: [{selectedIndex + 1}]{' '}
          {models[selectedIndex]?.name}):
        </Text>
        {typedInput.length > 0 && (
          <Box gap={1} marginTop={1}>
            <Text color={Theme.colors.accent}>Input:</Text>
            <Text bold color={Theme.colors.text}>
              {typedInput}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
