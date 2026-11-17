import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Plan } from '@evolve/core';
import { Theme } from './Theme.js';

export interface PlanCardProps {
  plan: Plan;
  onApprove?: ((planId: string) => void) | undefined;
  onReject?: ((planId: string) => void) | undefined;
  onRegenerate?: ((planId: string) => void) | undefined;
  onEditTask?: ((planId: string, taskId: string) => void) | undefined;
  onRun?: ((planId: string) => void) | undefined;
  onClose?: (() => void) | undefined;
}

export const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  onApprove,
  onReject,
  onRegenerate,
  onEditTask,
  onRun,
  onClose,
}) => {
  const [selectedTaskIndex, setSelectedTaskIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      if (onClose) onClose();
      return;
    }

    if (key.return && onRun && plan.status === 'approved') {
      onRun(plan.planId);
      return;
    }

    if (input.toLowerCase() === 'a' && onApprove) {
      onApprove(plan.planId);
      return;
    }

    if (input.toLowerCase() === 'x' && onReject) {
      onReject(plan.planId);
      return;
    }

    if (input.toLowerCase() === 'r' && onRegenerate) {
      onRegenerate(plan.planId);
      return;
    }

    if (key.upArrow) {
      setSelectedTaskIndex((prev) => (prev > 0 ? prev - 1 : plan.tasks.length - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedTaskIndex((prev) => (prev < plan.tasks.length - 1 ? prev + 1 : 0));
      return;
    }

    if (input.toLowerCase() === 'e' && onEditTask && plan.tasks[selectedTaskIndex]) {
      onEditTask(plan.planId, plan.tasks[selectedTaskIndex]!.id);
      return;
    }
  });

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

  const getBadgeColor = (val: string) => {
    switch (val.toLowerCase()) {
      case 'high':
        return Theme.colors.error;
      case 'medium':
        return Theme.colors.warning;
      default:
        return Theme.colors.success;
    }
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={Theme.colors.accent} paddingX={1} marginY={1}>
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color={Theme.colors.accent} bold>
          {Theme.icons.sparkle} EVOLVE — IMPLEMENTATION PLAN
        </Text>
        <Text color={getStatusColor(plan.status)} bold>
          [{plan.status.toUpperCase()}] (Rev {plan.revision})
        </Text>
      </Box>

      {/* Title & Metadata */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color={Theme.colors.text}>
          Task: {plan.title}
        </Text>
        <Text color={Theme.colors.dim}>Objective: {plan.objective}</Text>
        <Box gap={2} marginTop={1}>
          <Text color={Theme.colors.dim}>
            Mode: <Text color={Theme.colors.text}>{plan.mode.toUpperCase()}</Text>
          </Text>
          <Text color={Theme.colors.dim}>
            Complexity:{' '}
            <Text color={getBadgeColor(plan.estimatedComplexity)} bold>
              {plan.estimatedComplexity.toUpperCase()}
            </Text>
          </Text>
          <Text color={Theme.colors.dim}>
            Overall Risk:{' '}
            <Text color={getBadgeColor(plan.risks.overallRisk)} bold>
              {plan.risks.overallRisk.toUpperCase()}
            </Text>
          </Text>
        </Box>
      </Box>

      {/* Requirements Summary */}
      {plan.requirements.functionalRequirements.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={Theme.colors.dim} bold>
            Requirements:
          </Text>
          {plan.requirements.functionalRequirements.slice(0, 4).map((req, idx) => (
            <Text key={idx} color={Theme.colors.text}>
              {'  '}{Theme.icons.bullet} {req}
            </Text>
          ))}
        </Box>
      )}

      {/* Tasks List */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={Theme.colors.accent} bold>
          Tasks ({plan.tasks.length}):
        </Text>
        {plan.tasks.map((task, idx) => {
          const isSelected = idx === selectedTaskIndex;
          const deps = task.dependencies.length > 0 ? ` (Depends on: ${task.dependencies.join(', ')})` : '';

          return (
            <Box
              key={task.id}
              flexDirection="column"
              marginY={0}
              paddingLeft={1}
              borderStyle={isSelected ? 'single' : undefined}
              borderColor={isSelected ? Theme.colors.tool : undefined}
            >
              <Box gap={1}>
                <Text color={isSelected ? Theme.colors.accent : Theme.colors.text} bold>
                  [{idx + 1}] {task.title}
                </Text>
                <Text color={Theme.colors.dim}>{deps}</Text>
              </Box>
              <Text color={Theme.colors.dim}>
                {'    '}Complexity: <Text color={getBadgeColor(task.estimatedComplexity)}>{task.estimatedComplexity}</Text>
                {task.relevantFiles.length > 0 && ` • Files: ${task.relevantFiles.slice(0, 2).join(', ')}`}
              </Text>
              {isSelected && task.description && (
                <Text color={Theme.colors.dim}>
                  {'    '}{task.description}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Risk Summary */}
      {plan.risks.summary && (
        <Box marginBottom={1}>
          <Text color={Theme.colors.warning}>
            Risk Assessment: {plan.risks.summary}
          </Text>
        </Box>
      )}

      {/* Action Footer */}
      <Box
        justifyContent="space-between"
        borderStyle="single"
        borderColor={Theme.colors.border}
        paddingX={1}
        marginTop={1}
      >
        <Box gap={2}>
          {plan.status === 'approved' ? (
            <Text color={Theme.colors.success} bold>
              [Enter] Run Plan
            </Text>
          ) : (
            <Text color={Theme.colors.success} bold>
              [A] Approve Plan
            </Text>
          )}
          <Text color={Theme.colors.accent} bold>
            [R] Regenerate
          </Text>
          <Text color={Theme.colors.error} bold>
            [X] Reject
          </Text>
        </Box>
        <Text color={Theme.colors.dim}>[↑/↓] Select Task • [Esc] Exit</Text>
      </Box>
    </Box>
  );
};
