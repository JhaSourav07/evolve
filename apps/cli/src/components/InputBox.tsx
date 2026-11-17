import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Theme } from './Theme.js';

export interface InputBoxProps {
  onSubmit: (text: string) => void;
  isLoading: boolean;
  onCancel?: (() => void) | undefined;
  onToggleThinking?: (() => void) | undefined;
  placeholder?: string | undefined;
}

const SLASH_COMMANDS = [
  '/plan',
  '/model',
  '/models',
  '/status',
  '/history',
  '/memory',
  '/integrations',
  '/feedback',
  '/details',
  '/clear',
  '/new',
  '/help',
  '/exit',
] as const;

export const InputBox: React.FC<InputBoxProps> = ({
  onSubmit,
  isLoading,
  onCancel,
  onToggleThinking,
  placeholder = 'Type instructions or /help...',
}) => {
  const [value, setValue] = useState('');
  const [cursor, setCursor] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [spinnerTick, setSpinnerTick] = useState(0);

  // Spinner animation effect only while loading
  useEffect(() => {
    if (!isLoading) return;
    const timer = setInterval(() => {
      setSpinnerTick((prev) => (prev + 1) % Theme.icons.spinnerFrames.length);
    }, 120);
    return () => clearInterval(timer);
  }, [isLoading]);

  // Autocomplete matching
  const isTypingCommand = value.startsWith('/') && !value.includes(' ');
  const matchingCommands = isTypingCommand
    ? SLASH_COMMANDS.filter((cmd) => cmd.startsWith(value.toLowerCase()))
    : [];

  useInput((input, key) => {
    // Ctrl+O: toggle details across states
    if (key.ctrl && input.toLowerCase() === 'o') {
      onToggleThinking?.();
      return;
    }

    // Ctrl+C: cancellation / exit
    if (key.ctrl && input.toLowerCase() === 'c') {
      onCancel?.();
      return;
    }

    // While loading, ignore normal typing
    if (isLoading) {
      return;
    }

    // Tab: Autocomplete slash commands
    if (key.tab) {
      if (matchingCommands.length > 0 && matchingCommands[0]) {
        const completed = matchingCommands[0] + ' ';
        setValue(completed);
        setCursor(completed.length);
      }
      return;
    }

    // Return (Enter)
    if (key.return) {
      // Multiline check: if ending with backslash, add newline
      if (value.endsWith('\\')) {
        const nextVal = value.slice(0, -1) + '\n';
        setValue(nextVal);
        setCursor(nextVal.length);
        return;
      }

      const trimmed = value.trim();
      if (trimmed) {
        setHistory((prev) => [trimmed, ...prev.slice(0, 49)]);
        setHistoryIndex(-1);
        setValue('');
        setCursor(0);
        onSubmit(trimmed);
      }
      return;
    }

    // Left Arrow
    if (key.leftArrow) {
      setCursor((prev) => Math.max(0, prev - 1));
      return;
    }

    // Right Arrow
    if (key.rightArrow) {
      setCursor((prev) => Math.min(value.length, prev + 1));
      return;
    }

    // Ctrl+A / Home
    if (key.ctrl && input.toLowerCase() === 'a') {
      setCursor(0);
      return;
    }

    // Ctrl+E / End
    if (key.ctrl && input.toLowerCase() === 'e') {
      setCursor(value.length);
      return;
    }

    // Up Arrow: History navigation
    if (key.upArrow) {
      if (history.length > 0 && historyIndex < history.length - 1) {
        const nextIndex = historyIndex + 1;
        setHistoryIndex(nextIndex);
        const item = history[nextIndex];
        if (item !== undefined) {
          setValue(item);
          setCursor(item.length);
        }
      }
      return;
    }

    // Down Arrow: History navigation
    if (key.downArrow) {
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        const item = history[nextIndex];
        if (item !== undefined) {
          setValue(item);
          setCursor(item.length);
        }
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setValue('');
        setCursor(0);
      }
      return;
    }

    // Backspace: Delete before cursor
    if (key.backspace) {
      if (cursor > 0) {
        const nextVal = value.slice(0, cursor - 1) + value.slice(cursor);
        setValue(nextVal);
        setCursor((c) => c - 1);
      }
      return;
    }

    // Delete: Delete at cursor
    if (key.delete) {
      if (cursor < value.length) {
        const nextVal = value.slice(0, cursor) + value.slice(cursor + 1);
        setValue(nextVal);
      }
      return;
    }

    // Regular typing or multiline paste
    if (!key.ctrl && !key.meta) {
      const nextVal = value.slice(0, cursor) + input + value.slice(cursor);
      setValue(nextVal);
      setCursor((c) => c + input.length);
    }
  });

  // Render text with interactive cursor
  const renderInputLine = () => {
    if (value.length === 0) {
      return (
        <Box>
          <Text color={Theme.colors.dim} italic>
            {placeholder}
          </Text>
          <Text color={Theme.colors.silver} bold>
            _
          </Text>
        </Box>
      );
    }

    const beforeCursor = value.slice(0, cursor);
    const atCursor = value.slice(cursor, cursor + 1) || ' ';
    const afterCursor = value.slice(cursor + 1);

    return (
      <Text>
        <Text color={Theme.colors.text}>{beforeCursor}</Text>
        <Text color={Theme.colors.background} backgroundColor={Theme.colors.silver}>
          {atCursor}
        </Text>
        <Text color={Theme.colors.text}>{afterCursor}</Text>
      </Text>
    );
  };

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Autocomplete suggestions bar */}
      {matchingCommands.length > 0 && (
        <Box gap={1} marginBottom={0} paddingLeft={2}>
          <Text color={Theme.colors.dim}>Suggested:</Text>
          {matchingCommands.slice(0, 5).map((cmd) => (
            <Text key={cmd} color={Theme.colors.silver} bold>
              {cmd}
            </Text>
          ))}
          <Text color={Theme.colors.dim} dimColor>
            (Tab to complete)
          </Text>
        </Box>
      )}

      {/* Main Input Line */}
      <Box paddingLeft={0}>
        {isLoading ? (
          <Box>
            <Text color={Theme.colors.silver} bold>
              {Theme.icons.spinnerFrames[spinnerTick]}{' '}
            </Text>
            <Text color={Theme.colors.dim} italic>
              Evolve is working... (Ctrl+C to cancel)
            </Text>
          </Box>
        ) : (
          <Box>
            <Text color={Theme.colors.silver} bold>
              {Theme.icons.prompt}{' '}
            </Text>
            {renderInputLine()}
          </Box>
        )}
      </Box>

      {/* Minimal helper line */}
      <Box marginTop={0} paddingLeft={2}>
        <Text color={Theme.colors.dim} dimColor>
          Enter: send • \+Enter: newline • Tab: autocomplete • Ctrl+O: details • Ctrl+C: cancel
        </Text>
      </Box>
    </Box>
  );
};
