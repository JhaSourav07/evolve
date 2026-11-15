import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Theme } from './Theme.js';

export interface FeedbackPromptProps {
  sessionId: string;
  toolCallId?: string;
  onSubmit: (rating: number, notes?: string, correction?: string) => void;
  onCancel: () => void;
}

export const FeedbackPrompt: React.FC<FeedbackPromptProps> = ({ onSubmit, onCancel }) => {
  const [step, setStep] = useState<'rating' | 'notes'>('rating');
  const [selectedRating, setSelectedRating] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');

  useInput((input, key) => {
    if (step === 'rating') {
      if (input === '1') {
        setSelectedRating(1);
        setStep('notes');
      } else if (input === '2') {
        setSelectedRating(0);
        setStep('notes');
      } else if (input === '3') {
        setSelectedRating(-1);
        setStep('notes');
      } else if (key.escape || input.toLowerCase() === 'c') {
        onCancel();
      }
    } else if (step === 'notes') {
      if (key.return) {
        onSubmit(
          selectedRating,
          notes || undefined,
          selectedRating < 1 ? notes || undefined : undefined,
        );
      } else if (key.backspace || key.delete) {
        setNotes((prev) => prev.slice(0, -1));
      } else if (key.escape) {
        onCancel();
      } else if (!key.ctrl && !key.meta && input) {
        setNotes((prev) => prev + input);
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Theme.colors.accent}
      paddingX={1}
      marginY={1}
    >
      <Box>
        <Text color={Theme.colors.accent} bold>
          {Theme.icons.sparkle} Provide Interaction Feedback
        </Text>
      </Box>

      {step === 'rating' ? (
        <Box flexDirection="column" marginY={1}>
          <Text color={Theme.colors.text}>How was the agent response?</Text>
          <Box marginTop={1}>
            <Text color={Theme.colors.success}>[1] Correct (+1) </Text>
            <Text color={Theme.colors.warning}> [2] Partially Correct (0) </Text>
            <Text color={Theme.colors.error}> [3] Incorrect (-1) </Text>
            <Text color={Theme.colors.dim}> [C] Cancel</Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginY={1}>
          <Text color={Theme.colors.text}>
            Rating:{' '}
            {selectedRating === 1
              ? 'Correct (+1)'
              : selectedRating === 0
                ? 'Partially Correct (0)'
                : 'Incorrect (-1)'}
          </Text>
          <Text color={Theme.colors.dim}>
            Enter optional correction or notes (Press Enter to submit, Esc to cancel):
          </Text>
          <Box marginTop={1}>
            <Text color={Theme.colors.accent}>&gt; </Text>
            <Text color={Theme.colors.text}>{notes}</Text>
            <Text color={Theme.colors.accent}>_</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
