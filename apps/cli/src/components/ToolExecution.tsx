import React from 'react';
import { Box, Text } from 'ink';
import { Theme } from './Theme.js';

export interface ToolExecutionProps {
  toolName: string;
  args?: Record<string, unknown> | undefined;
  status: 'running' | 'completed' | 'failed';
  output?: string | undefined;
  error?: string | undefined;
  durationMs?: number | undefined;
  isExpanded?: boolean | undefined;
}

/**
 * Format tool invocation into a human-readable action phrase.
 */
export function formatToolAction(toolName: string, args?: Record<string, unknown>): string {
  switch (toolName) {
    case 'read_file':
      return args?.path ? `Reading ${String(args.path)}` : 'Reading file';
    case 'list_files':
      return args?.path ? `Listing ${String(args.path)}` : 'Listing files';
    case 'search_code':
      return args?.query ? `Searching "${String(args.query)}"` : 'Searching repository';
    case 'edit_file':
      return args?.path ? `Editing ${String(args.path)}` : 'Editing file';
    case 'write_file':
      return args?.path ? `Writing ${String(args.path)}` : 'Writing file';
    case 'run_command':
      return args?.command ? `Running ${String(args.command)}` : 'Running command';
    case 'inspect_project':
      return 'Inspecting project structure';
    case 'get_project_structure':
      return 'Reading project layout';
    case 'find_symbol':
      return args?.name ? `Locating symbol "${String(args.name)}"` : 'Locating symbol';
    case 'find_references':
      return args?.name ? `Finding references for "${String(args.name)}"` : 'Finding references';
    case 'get_dependencies':
      return args?.path ? `Inspecting dependencies of ${String(args.path)}` : 'Inspecting dependencies';
    case 'get_related_files':
      return args?.path ? `Tracing related files for ${String(args.path)}` : 'Tracing related files';
    default: {
      if (!args) return toolName;
      const entries = Object.entries(args);
      if (entries.length === 0) return toolName;
      const formatted = entries
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(' ');
      return `${toolName} ${formatted}`;
    }
  }
}

export function formatToolPastTense(toolName: string, args?: Record<string, unknown>): string {
  switch (toolName) {
    case 'read_file':
      return args?.path ? `Read ${String(args.path)}` : 'Read file';
    case 'list_files':
      return args?.path ? `Listed ${String(args.path)}` : 'Listed files';
    case 'search_code':
      return args?.query ? `Searched "${String(args.query)}"` : 'Searched repository';
    case 'edit_file':
      return args?.path ? `Edited ${String(args.path)}` : 'Edited file';
    case 'write_file':
      return args?.path ? `Wrote ${String(args.path)}` : 'Wrote file';
    case 'run_command':
      return args?.command ? `Ran ${String(args.command)}` : 'Executed command';
    case 'inspect_project':
      return 'Inspected project structure';
    case 'get_project_structure':
      return 'Read project layout';
    case 'find_symbol':
      return args?.name ? `Located symbol "${String(args.name)}"` : 'Located symbol';
    case 'find_references':
      return args?.name ? `Found references for "${String(args.name)}"` : 'Found references';
    case 'get_dependencies':
      return args?.path ? `Analyzed dependencies of ${String(args.path)}` : 'Analyzed dependencies';
    case 'get_related_files':
      return args?.path ? `Traced related files for ${String(args.path)}` : 'Traced related files';
    default:
      return toolName;
  }
}

export const ToolExecution: React.FC<ToolExecutionProps> = ({
  toolName,
  args,
  status,
  output,
  error,
  durationMs,
  isExpanded = false,
}) => {
  const isRunning = status === 'running';
  const isFailed = status === 'failed';
  const isCompleted = status === 'completed';

  const actionText = isCompleted
    ? formatToolPastTense(toolName, args)
    : formatToolAction(toolName, args);

  const durationStr = durationMs !== undefined ? ` (${durationMs}ms)` : '';

  const rawContent = output ?? error ?? '';
  const lines = rawContent.trim().length > 0 ? rawContent.trim().split('\n') : [];
  const lineCount = lines.length;
  const isMultiLine = lineCount > 1 || rawContent.length > 70;

  return (
    <Box flexDirection="column" marginY={0} paddingLeft={2}>
      <Box>
        {/* Status indicator */}
        {isRunning && (
          <Text color={Theme.colors.dim}>
            {Theme.icons.spinnerFrames[0]} {actionText}
          </Text>
        )}

        {isCompleted && (
          <Box>
            <Text color={Theme.colors.success}>{Theme.icons.check} </Text>
            <Text color={Theme.colors.silver}>
              {actionText}
              <Text color={Theme.colors.dim}>
                {durationStr}
                {isMultiLine && !isExpanded && ` (${lineCount} lines • Ctrl+O)`}
              </Text>
            </Text>
          </Box>
        )}

        {isFailed && (
          <Box>
            <Text color={Theme.colors.error}>{Theme.icons.cross} </Text>
            <Text color={Theme.colors.error}>
              {actionText}
              <Text color={Theme.colors.dim}>{durationStr}</Text>
              {error ? `: ${error}` : ''}
            </Text>
          </Box>
        )}
      </Box>

      {/* Expanded output view */}
      {isExpanded && isMultiLine && (
        <Box flexDirection="column" paddingLeft={2} marginY={0}>
          {lines.slice(0, 100).map((line, idx) => (
            <Box key={idx}>
              <Text color={Theme.colors.dim} dimColor>
                {Theme.icons.bar}{' '}
              </Text>
              <Text color={isFailed ? Theme.colors.error : Theme.colors.dim}>{line}</Text>
            </Box>
          ))}
          {lines.length > 100 && (
            <Text color={Theme.colors.dim} italic>
              {Theme.icons.bar} ... ({lines.length - 100} more lines truncated)
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
};
