import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Theme } from './Theme.js';

export interface InputBoxProps {
  onSubmit: (text: string) => void;
  isLoading: boolean;
  onCancel?: () => void;
  onToggleThinking?: () => void;
  placeholder?: string;
}

export const InputBox: React.FC<InputBoxProps> = ({
  onSubmit,
  isLoading,
  onCancel,
  onToggleThinking,
  placeholder = 'Ask Evolve to code, test, or refactor...',
}) => {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [spinnerTick, setSpinnerTick] = useState(0);

  // Spinner animation effect during loading
  React.useEffect(() => {
    if (!isLoading) return;
    const timer = setInterval(() => {
      setSpinnerTick((prev) => (prev + 1) % 4);
    }, 150);
    return () => clearInterval(timer);
  }, [isLoading]);

  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸'];

  useInput((input, key) => {
    // Ctrl+O toggles thinking collapse / expand across states
    if (key.ctrl && input.toLowerCase() === 'o') {
      onToggleThinking?.();
      return;
    }

    if (isLoading) {
      if (key.ctrl && input.toLowerCase() === 'c') {
        onCancel?.();
      }
      return;
    }

    if (key.ctrl && input.toLowerCase() === 'c') {
      onCancel?.();
      return;
    }

    if (key.return) {
      // Check for multiline continuation using trailing backslash
      if (value.endsWith('\\')) {
        setValue((prev) => prev.slice(0, -1) + '\n');
        return;
      }

      const trimmed = value.trim();
      if (trimmed) {
        setHistory((prev) => [trimmed, ...prev.slice(0, 49)]);
        setHistoryIndex(-1);
        setValue('');
        onSubmit(trimmed);
      }
      return;
    }

    if (key.upArrow) {
      if (history.length > 0 && historyIndex < history.length - 1) {
        const nextIndex = historyIndex + 1;
        setHistoryIndex(nextIndex);
        const item = history[nextIndex];
        if (item !== undefined) {
          setValue(item);
        }
      }
      return;
    }

    if (key.downArrow) {
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        const item = history[nextIndex];
        if (item !== undefined) {
          setValue(item);
        }
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setValue('');
      }
      return;
    }

    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    // Normal text input
    if (!key.ctrl && !key.meta) {
      setValue((prev) => prev + input);
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isLoading ? Theme.colors.warning : Theme.colors.border}
      paddingX={1}
      marginTop={1}
    >
      <Box>
        {isLoading ? (
          <Text color={Theme.colors.warning} bold>
            {spinnerFrames[spinnerTick]} Evolve is thinking & coding...
          </Text>
        ) : (
          <>
            <Text color={Theme.colors.accent} bold>
              ❯{' '}
            </Text>
            {value.length === 0 ? (
              <Text color={Theme.colors.dim} italic>
                {placeholder}
              </Text>
            ) : (
              <Text color={Theme.colors.text}>{value}</Text>
            )}
            <Text color={Theme.colors.accent}>_</Text>
          </>
        )}
      </Box>
      <Box justifyContent="space-between" marginTop={0}>
        <Text color={Theme.colors.dim} dimColor>
          Enter: send • Ctrl+O: toggle details • /help: commands
        </Text>
        {isLoading && (
          <Text color={Theme.colors.dim} dimColor>
            Press Ctrl+C to cancel
          </Text>
        )}
      </Box>
    </Box>
  );
};
