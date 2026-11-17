import type {
  FailureCategory,
  FailureClassification,
  PlanTask,
  VerificationResult,
} from '@evolve/core';

export interface FailureClassificationInput {
  task: PlanTask;
  verifications: VerificationResult[];
  runtimeError?: string | undefined;
  toolCalls?: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    error?: string | undefined;
    success?: boolean | undefined;
  }> | undefined;
  filesModified: string[];
}

export class FailureClassifier {
  /**
   * Classifies task and execution failures into actionable, structured categories.
   * Supports multi-label classifications with concrete evidence strings.
   */
  public classify(input: FailureClassificationInput): FailureClassification[] {
    const classifications: FailureClassification[] = [];

    // 1. Test Failures
    const testFailures = input.verifications.filter(
      (v) => (v.stage === 'test' || v.command.includes('test')) && (!v.success || v.exitCode !== 0),
    );
    if (testFailures.length > 0) {
      const err = testFailures.map((v) => v.stderr || v.stdout).join('; ');
      classifications.push({
        category: 'test_failure',
        explanation: 'Unit, integration, or regression test suite failed during verification.',
        evidence: err.slice(0, 300),
      });
    }

    // 2. Build / Typecheck Failures
    const buildFailures = input.verifications.filter(
      (v) =>
        (v.stage === 'build' || v.stage === 'typecheck' || v.command.includes('tsc')) &&
        (!v.success || v.exitCode !== 0),
    );
    if (buildFailures.length > 0) {
      const err = buildFailures.map((v) => v.stderr || v.stdout).join('; ');
      classifications.push({
        category: 'build_failure',
        explanation: 'TypeScript typechecking or build compilation failed.',
        evidence: err.slice(0, 300),
      });
    }

    // 3. Command Execution Failures
    const otherFailedCommands = input.verifications.filter(
      (v) =>
        v.stage !== 'test' &&
        v.stage !== 'build' &&
        v.stage !== 'typecheck' &&
        (!v.success || v.exitCode !== 0),
    );
    if (otherFailedCommands.length > 0) {
      classifications.push({
        category: 'command_execution_failure',
        explanation: 'Terminal verification command exited with non-zero exit code.',
        evidence: otherFailedCommands.map((c) => `${c.command}: ${c.stderr || c.stdout}`).join('; ').slice(0, 300),
      });
    }

    // 4. Incorrect Tool Selection or Tool Failures
    if (input.toolCalls && input.toolCalls.length > 0) {
      const failedTools = input.toolCalls.filter((t) => t.success === false || Boolean(t.error));
      if (failedTools.length > 0) {
        const hasWrongTool = failedTools.some((t) =>
          t.error?.toLowerCase().includes('unknown tool') ||
          t.error?.toLowerCase().includes('invalid argument') ||
          t.error?.toLowerCase().includes('not supported'),
        );

        if (hasWrongTool) {
          classifications.push({
            category: 'incorrect_tool_selection',
            explanation: 'Agent attempted to call an inappropriate or invalidly parametrized tool.',
            evidence: failedTools.map((t) => `${t.toolName}: ${t.error}`).join('; ').slice(0, 250),
          });
        }

        const pathErrors = failedTools.filter((t) =>
          t.error?.toLowerCase().includes('enoent') ||
          t.error?.toLowerCase().includes('not found') ||
          t.error?.toLowerCase().includes('does not exist'),
        );
        if (pathErrors.length > 0) {
          classifications.push({
            category: 'repository_misunderstanding',
            explanation: 'Agent assumed files or directories exist that are not present in repository.',
            evidence: pathErrors.map((t) => `${t.toolName}: ${t.error}`).join('; ').slice(0, 250),
          });
        }
      }
    }

    // 5. Missing Requirement / Incomplete Implementation
    if (input.filesModified.length === 0 && (input.task.relevantFiles?.length ?? 0) > 0) {
      classifications.push({
        category: 'missing_requirement',
        explanation: 'Task finished without modifying any of the planned files required to satisfy the objective.',
        evidence: `Planned files: [${input.task.relevantFiles.join(', ')}]`,
      });
    } else if (testFailures.length > 0 && input.filesModified.length > 0) {
      classifications.push({
        category: 'incorrect_implementation',
        explanation: 'Source code was modified but failed to satisfy behavioral assertions.',
        evidence: `Modified files: [${input.filesModified.join(', ')}]`,
      });
    }

    // 6. Runtime or Model Reasoning Failures
    if (input.runtimeError) {
      if (
        input.runtimeError.includes('max steps') ||
        input.runtimeError.includes('iteration limit')
      ) {
        classifications.push({
          category: 'model_reasoning_failure',
          explanation: 'Agent exhausted max steps without completing the task or converging to a solution.',
          evidence: input.runtimeError,
        });
      } else if (input.runtimeError.includes('ambiguity') || input.runtimeError.includes('clarification')) {
        classifications.push({
          category: 'user_requirement_ambiguity',
          explanation: 'Essential task specification was ambiguous or missing required details.',
          evidence: input.runtimeError,
        });
      }
    }

    return classifications;
  }
}

