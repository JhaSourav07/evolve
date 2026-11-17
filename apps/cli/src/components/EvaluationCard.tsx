import React from 'react';
import { Box, Text } from 'ink';
import type { TaskEvaluationReport } from '@evolve/core';
import { Theme } from './Theme.js';

export interface EvaluationCardProps {
  evaluation: TaskEvaluationReport;
  compact?: boolean;
}

export const EvaluationCard: React.FC<EvaluationCardProps> = ({ evaluation, compact = false }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified':
        return Theme.colors.success;
      case 'verified_with_limitations':
        return Theme.colors.warning;
      case 'failed':
        return Theme.colors.error;
      default:
        return Theme.colors.dim;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return `${Theme.icons.check} VERIFIED`;
      case 'verified_with_limitations':
        return `▲ PARTIAL`;
      case 'failed':
        return `${Theme.icons.cross} FAILED`;
      default:
        return `${Theme.icons.bulletOpen} UNVERIFIED`;
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={Theme.colors.border}
      paddingX={1}
      marginY={1}
    >
      {/* Header */}
      <Box justifyContent="space-between">
        <Box gap={1}>
          <Text color={Theme.colors.accent} bold>
            {Theme.icons.sparkle} Task Evaluation
          </Text>
          <Text color={Theme.colors.dim}>({evaluation.id.slice(0, 16)})</Text>
        </Box>
        <Box gap={1}>
          <Text color={getStatusColor(evaluation.overallStatus)} bold>
            {getStatusBadge(evaluation.overallStatus)}
          </Text>
          <Text color={Theme.colors.silver}>[{evaluation.requirementCoverage}]</Text>
        </Box>
      </Box>

      {/* Task & Plan Reference */}
      <Box gap={2} marginTop={1}>
        <Text color={Theme.colors.dim}>Task: {evaluation.taskId ?? 'N/A'}</Text>
        {evaluation.planId && (
          <Text color={Theme.colors.dim}>Plan: {evaluation.planId.slice(0, 16)}</Text>
        )}
        <Text color={evaluation.trainingEligible ? Theme.colors.success : Theme.colors.dim}>
          {evaluation.trainingEligible ? '✦ Training Eligible' : '○ Not for Training'}
        </Text>
      </Box>

      {/* Quality Dimensions Breakdown */}
      <Box flexDirection="column" marginTop={1}>
        <Text color={Theme.colors.silver} bold>
          Quality Dimensions:
        </Text>
        <Box flexDirection="column" marginLeft={1}>
          {evaluation.dimensions.map((dim) => {
            const isPos = dim.result === 'positive';
            const isPartial = dim.result === 'partial';
            const dimColor = isPos
              ? Theme.colors.success
              : isPartial
                ? Theme.colors.warning
                : Theme.colors.error;
            const dimIcon = isPos ? Theme.icons.check : isPartial ? '▲' : Theme.icons.cross;
            return (
              <Box key={dim.dimension} justifyContent="space-between">
                <Box gap={1}>
                  <Text color={dimColor}>{dimIcon}</Text>
                  <Text color={Theme.colors.text}>{dim.dimension}:</Text>
                  <Text color={Theme.colors.dim}>{dim.supportingEvidence}</Text>
                </Box>
                <Text color={dimColor}>{dim.result.toUpperCase()}</Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Failures (if any) */}
      {evaluation.failures.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={Theme.colors.error} bold>
            {Theme.icons.cross} Failures Identified ({evaluation.failures.length}):
          </Text>
          <Box flexDirection="column" marginLeft={1}>
            {evaluation.failures.map((f, i) => (
              <Box key={i} flexDirection="column" marginY={0}>
                <Text color={Theme.colors.warning}>
                  [{f.category}]
                </Text>
                <Text color={Theme.colors.dim}>  {f.explanation}</Text>
                {f.evidence && (
                  <Text color={Theme.colors.silver}>  Evidence: {f.evidence}</Text>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Verification Evidence Overview */}
      {!compact && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={Theme.colors.silver} bold>
            Verification Evidence:
          </Text>
          <Box flexDirection="column" marginLeft={1}>
            <Box gap={1}>
              <Text color={Theme.colors.dim}>Tests:</Text>
              <Text
                color={
                  evaluation.testStatus === 'passed' ? Theme.colors.success : Theme.colors.error
                }
              >
                {evaluation.testStatus.toUpperCase()}
              </Text>
            </Box>

            <Box gap={1}>
              <Text color={Theme.colors.dim}>Build:</Text>
              <Text
                color={
                  evaluation.buildStatus === 'passed' ? Theme.colors.success : Theme.colors.error
                }
              >
                {evaluation.buildStatus.toUpperCase()}
              </Text>
            </Box>

            <Box gap={1}>
              <Text color={Theme.colors.dim}>Typecheck:</Text>
              <Text
                color={
                  evaluation.typecheckStatus === 'passed'
                    ? Theme.colors.success
                    : Theme.colors.error
                }
              >
                {evaluation.typecheckStatus.toUpperCase()}
              </Text>
            </Box>

            <Box gap={1}>
              <Text color={Theme.colors.dim}>Git Diff:</Text>
              <Text
                color={
                  evaluation.gitDiffStatus === 'clean' || evaluation.gitDiffStatus === 'reviewed'
                    ? Theme.colors.success
                    : Theme.colors.warning
                }
              >
                {evaluation.gitDiffStatus.toUpperCase()}
              </Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* Training Eligibility Reason */}
      {evaluation.trainingEligibilityReason && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={Theme.colors.dim}>
            Eligibility Note: {evaluation.trainingEligibilityReason}
          </Text>
        </Box>
      )}
    </Box>
  );
};
