import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Plan } from '@evolve/core';
import { Theme } from './Theme.js';

export interface PlanHistoryListProps {
  plans: readonly Plan[];
  onSelectPlan?: ((planId: string) => void) | undefined;
  onClose?: (() => void) | undefined;
}

export const PlanHistoryList: React.FC<PlanHistoryListProps> = ({ plans, onSelectPlan, onClose }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape && onClose) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, plans.length - 1)));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < plans.length - 1 ? prev + 1 : 0));
      return;
    }

    if (key.return && plans[selectedIndex] && onSelectPlan) {
      onSelectPlan(plans[selectedIndex]!.planId);
      return;
    }

    // Number keys 1-9
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= plans.length && onSelectPlan) {
      const selected = plans[num - 1];
      if (selected) {
        onSelectPlan(selected.planId);
      }
    }
  });

  if (plans.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={Theme.colors.border} padding={1}>
        <Text color={Theme.colors.accent} bold>
          {Theme.icons.sparkle} PLAN HISTORY
        </Text>
        <Text color={Theme.colors.dim} italic>
          No plans generated yet. Use /plan [objective] to create your first implementation plan.
        </Text>
        <Box marginTop={1}>
          <Text color={Theme.colors.dim}>[Esc] Back to chat</Text>
        </Box>
      </Box>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return Theme.colors.success;
      case 'rejected':
        return Theme.colors.error;
      case 'superseded':
        return Theme.colors.dim;
      default:
        return Theme.colors.warning;
    }
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={Theme.colors.border} padding={1}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color={Theme.colors.accent} bold>
          {Theme.icons.sparkle} IMPLEMENTATION PLAN HISTORY ({plans.length})
        </Text>
        <Text color={Theme.colors.dim}>[↑/↓] Navigate • [Enter] View • [Esc] Back</Text>
      </Box>

      {plans.map((p, idx) => {
        const isSelected = idx === selectedIndex;
        return (
          <Box
            key={p.planId}
            flexDirection="column"
            marginY={0}
            paddingLeft={1}
            borderStyle={isSelected ? 'single' : undefined}
            borderColor={isSelected ? Theme.colors.tool : undefined}
          >
            <Box justifyContent="space-between">
              <Text bold color={isSelected ? Theme.colors.accent : Theme.colors.text}>
                {idx + 1}. {p.title}
              </Text>
              <Text color={getStatusColor(p.status)} bold>
                [{p.status.toUpperCase()}]
              </Text>
            </Box>
            <Box gap={2}>
              <Text color={Theme.colors.dim}>ID: {p.planId}</Text>
              <Text color={Theme.colors.dim}>Tasks: {p.tasks.length}</Text>
              <Text color={Theme.colors.dim}>Mode: {p.mode}</Text>
              <Text color={Theme.colors.dim}>Rev: {p.revision}</Text>
              <Text color={Theme.colors.dim}>
                {new Date(p.createdAt).toLocaleDateString()}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
