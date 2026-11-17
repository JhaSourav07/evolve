import type {
  PlanTask,
  QualityDimension,
  QualityDimensionAssessment,
  VerificationResult,
} from '@evolve/core';

export interface QualityEvaluationInput {
  task: PlanTask;
  verifications: VerificationResult[];
  filesModified: string[];
  gitDiff?: string | undefined;
  toolCalls?: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    output?: string | undefined;
    error?: string | undefined;
    success?: boolean | undefined;
  }> | undefined;
  runtimeError?: string | undefined;
}

export class QualityEvaluator {
  /**
   * Assesses all 8 quality dimensions strictly using objective evidence
   * and separating automated verification evidence from subjective assumptions.
   */
  public evaluate(input: QualityEvaluationInput): QualityDimensionAssessment[] {
    const assessments: QualityDimensionAssessment[] = [];

    assessments.push(this.evaluateFunctionalCorrectness(input));
    assessments.push(this.evaluateRequirementCoverage(input));
    assessments.push(this.evaluateTestCoverageEvidence(input));
    assessments.push(this.evaluateCodeMaintainability(input));
    assessments.push(this.evaluateArchitecturalConsistency(input));
    assessments.push(this.evaluateSecurityConsiderations(input));
    assessments.push(this.evaluateErrorHandling(input));
    assessments.push(this.evaluateRegressionRisk(input));

    return assessments;
  }

  private evaluateFunctionalCorrectness(input: QualityEvaluationInput): QualityDimensionAssessment {
    const testVerifs = input.verifications.filter(
      (v) => v.stage === 'test' || v.command.includes('test'),
    );

    if (testVerifs.length === 0) {
      if (input.runtimeError) {
        return {
          dimension: 'functional_correctness',
          result: 'negative',
          supportingEvidence: `Runtime execution failed: ${input.runtimeError}`,
          confidence: 0.9,
          source: 'automated_verification',
        };
      }
      return {
        dimension: 'functional_correctness',
        result: 'unverified',
        supportingEvidence: 'No test verification stage was executed to validate functional correctness.',
        confidence: 0.5,
        source: 'automated_verification',
      };
    }

    const failedTests = testVerifs.filter((v) => !v.success || v.exitCode !== 0);
    if (failedTests.length > 0) {
      const errorMsg = failedTests.map((t) => t.stderr || t.stdout || 'Test failed').join('; ');
      return {
        dimension: 'functional_correctness',
        result: 'negative',
        supportingEvidence: `Test failures detected (${failedTests.length} failed command(s)): ${errorMsg.slice(0, 180)}`,
        confidence: 0.95,
        source: 'automated_verification',
      };
    }

    return {
      dimension: 'functional_correctness',
      result: 'positive',
      supportingEvidence: `All ${testVerifs.length} test verification command(s) passed with exit code 0.`,
      confidence: 0.95,
      source: 'automated_verification',
    };
  }

  private evaluateRequirementCoverage(input: QualityEvaluationInput): QualityDimensionAssessment {
    const expectedFiles = input.task.relevantFiles || [];
    const modified = input.filesModified;

    if (modified.length === 0 && expectedFiles.length > 0) {
      return {
        dimension: 'requirement_coverage',
        result: 'negative',
        supportingEvidence: `Expected changes in [${expectedFiles.join(', ')}], but no files were modified.`,
        confidence: 0.9,
        source: 'git_diff_analysis',
      };
    }

    const coveredExpected = expectedFiles.filter((f) =>
      modified.some((m) => m.includes(f) || f.includes(m)),
    );

    if (expectedFiles.length > 0 && coveredExpected.length < expectedFiles.length) {
      return {
        dimension: 'requirement_coverage',
        result: 'partial',
        supportingEvidence: `Modified ${coveredExpected.length}/${expectedFiles.length} planned files. Unmodified: [${expectedFiles.filter((f) => !coveredExpected.includes(f)).join(', ')}]`,
        confidence: 0.8,
        source: 'git_diff_analysis',
      };
    }

    return {
      dimension: 'requirement_coverage',
      result: 'positive',
      supportingEvidence: `Modified files match planned task scope: [${modified.join(', ')}]`,
      confidence: 0.85,
      source: 'git_diff_analysis',
    };
  }

  private evaluateTestCoverageEvidence(input: QualityEvaluationInput): QualityDimensionAssessment {
    const hasTestFileModified = input.filesModified.some(
      (f) => f.includes('.test.') || f.includes('.spec.') || f.includes('/test/') || f.includes('/tests/'),
    );
    const testExecuted = input.verifications.some(
      (v) => v.stage === 'test' || v.command.includes('test'),
    );

    if (hasTestFileModified && testExecuted) {
      return {
        dimension: 'test_coverage_evidence',
        result: 'positive',
        supportingEvidence: 'Unit tests were both modified/added and executed in verification.',
        confidence: 0.9,
        source: 'automated_verification',
      };
    }

    if (testExecuted) {
      return {
        dimension: 'test_coverage_evidence',
        result: 'partial',
        supportingEvidence: 'Verification tests were executed, but no new or modified test files were detected in git diff.',
        confidence: 0.75,
        source: 'automated_verification',
      };
    }

    return {
      dimension: 'test_coverage_evidence',
      result: 'unverified',
      supportingEvidence: 'No test execution or test file modifications detected.',
      confidence: 0.6,
      source: 'automated_verification',
    };
  }

  private evaluateCodeMaintainability(input: QualityEvaluationInput): QualityDimensionAssessment {
    const diff = input.gitDiff || '';
    if (!diff && input.filesModified.length === 0) {
      return {
        dimension: 'code_maintainability',
        result: 'unverified',
        supportingEvidence: 'No git diff available to analyze code maintainability.',
        confidence: 0.5,
        source: 'git_diff_analysis',
      };
    }

    // Check for obvious anti-patterns in diff lines
    const addedLines = diff
      .split('\n')
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'));

    const consoleLogs = addedLines.filter(
      (l) => l.includes('console.log(') || l.includes('debugger;') || l.includes('TODO: fix'),
    );

    if (consoleLogs.length > 3) {
      return {
        dimension: 'code_maintainability',
        result: 'partial',
        supportingEvidence: `Diff introduces ${consoleLogs.length} debug statements or unfinished TODO comments.`,
        confidence: 0.8,
        source: 'git_diff_analysis',
      };
    }

    return {
      dimension: 'code_maintainability',
      result: 'positive',
      supportingEvidence: `Clean git diff across ${input.filesModified.length} file(s) without excessive debug statements.`,
      confidence: 0.85,
      source: 'git_diff_analysis',
    };
  }

  private evaluateArchitecturalConsistency(
    input: QualityEvaluationInput,
  ): QualityDimensionAssessment {
    const affected = input.task.affectedComponents || [];
    const modified = input.filesModified;

    // Check if modifications stayed within expected components
    if (affected.length > 0 && modified.length > 0) {
      const outsideChanges = modified.filter(
        (f) => !affected.some((comp) => f.includes(comp)),
      );

      if (outsideChanges.length > 0 && outsideChanges.length >= modified.length / 2) {
        return {
          dimension: 'architectural_consistency',
          result: 'partial',
          supportingEvidence: `Changes touched components outside planned [${affected.join(', ')}]: [${outsideChanges.join(', ')}]`,
          confidence: 0.75,
          source: 'git_diff_analysis',
        };
      }
    }

    return {
      dimension: 'architectural_consistency',
      result: 'positive',
      supportingEvidence: 'Changes align with planned architecture components and module boundaries.',
      confidence: 0.85,
      source: 'git_diff_analysis',
    };
  }

  private evaluateSecurityConsiderations(input: QualityEvaluationInput): QualityDimensionAssessment {
    const diff = input.gitDiff || '';

    // Check for hardcoded API keys or secrets in diff
    const secretPatterns = [
      /(?:password|passwd|pwd|secret|api_key|apikey|bearer)\s*[:=]\s*["'][A-Za-z0-9_\-]{8,}["']/i,
      /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/,
    ];

    for (const pat of secretPatterns) {
      if (pat.test(diff)) {
        return {
          dimension: 'security_considerations',
          result: 'negative',
          supportingEvidence: 'Potential hardcoded credential or token detected in git diff.',
          confidence: 0.9,
          source: 'static_analysis',
        };
      }
    }

    return {
      dimension: 'security_considerations',
      result: 'positive',
      supportingEvidence: 'No hardcoded credentials, secret leaks, or insecure commands detected.',
      confidence: 0.9,
      source: 'static_analysis',
    };
  }

  private evaluateErrorHandling(input: QualityEvaluationInput): QualityDimensionAssessment {
    if (input.runtimeError) {
      return {
        dimension: 'error_handling',
        result: 'negative',
        supportingEvidence: `Uncaught error during execution: ${input.runtimeError}`,
        confidence: 0.85,
        source: 'automated_verification',
      };
    }

    const diff = input.gitDiff || '';
    const hasTryCatchOrGuard =
      diff.includes('try {') ||
      diff.includes('catch') ||
      diff.includes('if (!') ||
      diff.includes('throw new Error');

    if (hasTryCatchOrGuard) {
      return {
        dimension: 'error_handling',
        result: 'positive',
        supportingEvidence: 'Explicit defensive checks or try/catch error handling added in diff.',
        confidence: 0.8,
        source: 'static_analysis',
      };
    }

    return {
      dimension: 'error_handling',
      result: 'partial',
      supportingEvidence: 'Standard error propagation without explicit new try/catch blocks.',
      confidence: 0.7,
      source: 'static_analysis',
    };
  }

  private evaluateRegressionRisk(input: QualityEvaluationInput): QualityDimensionAssessment {
    if (input.task.breakingChange) {
      return {
        dimension: 'regression_risk',
        result: 'partial',
        supportingEvidence: 'Task is marked as an intentional breaking change.',
        confidence: 0.9,
        source: 'git_diff_analysis',
      };
    }

    const testVerifs = input.verifications.filter((v) => v.stage === 'test');
    if (testVerifs.length > 0 && testVerifs.every((v) => v.success)) {
      return {
        dimension: 'regression_risk',
        result: 'positive',
        supportingEvidence: 'Automated test suite passed completely with no regressions detected.',
        confidence: 0.9,
        source: 'automated_verification',
      };
    }

    return {
      dimension: 'regression_risk',
      result: 'unverified',
      supportingEvidence: 'Limited automated regression verification evidence available.',
      confidence: 0.6,
      source: 'automated_verification',
    };
  }
}
