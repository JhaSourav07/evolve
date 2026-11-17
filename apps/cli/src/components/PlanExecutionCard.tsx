import React from 'react';
import { Box, Text } from 'ink';
import type { Plan, PlanTask } from '@evolve/core';
import { Theme } from './Theme.js';

export interface PlanExecutionCardProps {
  plan: Plan;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  currentTaskIndex?: number | undefined;
  currentTask?: PlanTask | undefined;
  activeTool?: { toolName: string; detail?: string } | undefined;
  activeStage?: { stage: string; status: 'running' | 'passed' | 'failed' } | undefined;
  completedTasks: number;
  failedTasks: number;
  filesModified?: string[] | undefined;
  durationMs?: number | undefined;
  error?: string | undefined;
}

export const PlanExecutionCard: React.FC<PlanExecutionCardProps> = ({
  plan,
  status,
  currentTaskIndex = 0,
  currentTask,
  activeTool,
  activeStage,
  completedTasks,
  failedTasks,
  filesModified = [],
  durationMs = 0,
  error,
}) => {
  const getStatusColor = (s: string) => {
    switch (s) {
      case 'completed':
        return Theme.colors.success;
      case 'failed':
        return Theme.colors.error;
      case 'cancelled':
        return Theme.colors.warning;
      case 'running':
      default:
        return Theme.colors.accent;
    }
  };

  const formattedDuration = `${(durationMs / 1000).toFixed(1)}s`;
  const totalTasks = plan.tasks.length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={getStatusColor(status)}
      paddingX={1}
      marginY={1}
    >
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color={Theme.colors.accent} bold>
          {Theme.icons.sparkle} EVOLVE — EXECUTION ENGINE
        </Text>
        <Text color={getStatusColor(status)} bold>
          [{status.toUpperCase()}] ({progressPercent}% · {formattedDuration})
        </Text>
      </Box>

      {/* Plan Objective */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={Theme.colors.text} bold>
          {plan.title}
        </Text>
        <Text color={Theme.colors.dim}>
          {plan.objective}
        </Text>
      </Box>

      {/* Task Progress Bar */}
      <Box flexDirection="row" marginBottom={1}>
        <Text color={Theme.colors.silver}>Tasks: </Text>
        <Text color={Theme.colors.success} bold>
          {completedTasks} completed
        </Text>
        {failedTasks > 0 && (
          <Text color={Theme.colors.error} bold>
            {' '}· {failedTasks} failed
          </Text>
        )}
        <Text color={Theme.colors.dim}>
          {' '}· {totalTasks - completedTasks - failedTasks} remaining
        </Text>
      </Box>

      {/* Active Task Details */}
      {status === 'running' && currentTask && (
        <Box
          flexDirection="column"
          paddingLeft={1}
          borderStyle="single"
          borderLeft
          borderRight={false}
          borderTop={false}
          borderBottom={false}
          borderColor={Theme.colors.border}
          marginBottom={1}
        >
          <Text color={Theme.colors.text} bold>
            [{currentTaskIndex + 1}/{totalTasks}] {currentTask.title}
          </Text>
          <Text color={Theme.colors.dim}>
            Objective: {currentTask.objective}
          </Text>

          {activeTool && (
            <Box marginTop={1}>
              <Text color={Theme.colors.accent}>
                ⚙ Tool: {activeTool.toolName}
              </Text>
              {activeTool.detail && (
                <Text color={Theme.colors.silver}>
                  {' '}— {activeTool.detail}
                </Text>
              )}
            </Box>
          )}

          {activeStage && (
            <Box marginTop={activeTool ? 0 : 1}>
              <Text
                color={
                  activeStage.status === 'passed'
                    ? Theme.colors.success
                    : activeStage.status === 'failed'
                    ? Theme.colors.error
                    : Theme.colors.warning
                }
              >
                {activeStage.status === 'passed'
                  ? '✓'
                  : activeStage.status === 'failed'
                  ? '✖'
                  : '⟳'}{' '}
                Stage: {activeStage.stage} ({activeStage.status})
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* Files Modified */}
      {filesModified.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={Theme.colors.silver} bold>
            Modified Files ({filesModified.length}):
          </Text>
          {filesModified.slice(0, 5).map((f) => (
            <Text key={f} color={Theme.colors.dim}>
              {' '}• {f}
            </Text>
          ))}
          {filesModified.length > 5 && (
            <Text color={Theme.colors.dim}>
              {' '}...and {filesModified.length - 5} more
            </Text>
          )}
        </Box>
      )}

      {/* Error Display */}
      {error && (
        <Box marginTop={1} paddingX={1} borderStyle="single" borderColor={Theme.colors.error}>
          <Text color={Theme.colors.error}>Error: {error}</Text>
        </Box>
      )}
    </Box>
  );
};
