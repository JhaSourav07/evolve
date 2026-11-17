import type {
  MemoryCategory,
  MemoryExtractionCandidate,
  MemoryItem,
  Plan,
  PlanExecutionResult,
} from '@evolve/core';
import type { MemoryConsolidator } from './consolidator.js';
import { scrubSecrets } from '../tools/security.js';

export interface ArchitectureSummary {
  architecture?: string | undefined;
  database?: string | undefined;
  frameworks?: string[] | undefined;
  conventions?: string[] | undefined;
  patterns?: string[] | undefined;
}

export class MemoryExtractor {
  constructor(private readonly consolidator?: MemoryConsolidator | undefined) {}

  /**
   * Extracts verified solutions and failed attempt memories from plan and task execution results.
   */
  public extractFromExecution(
    plan: Plan,
    result: PlanExecutionResult,
    options?: { projectId?: string; sessionId?: string } | undefined,
  ): MemoryExtractionCandidate[] {
    const candidates: MemoryExtractionCandidate[] = [];
    const taskMap = new Map(plan.tasks.map((t) => [t.id, t]));

    for (const taskResult of result.tasks) {
      const task = taskMap.get(taskResult.taskId);
      const title = task?.title ?? taskResult.taskId;
      const sanitizedKeyBase = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);

      if (taskResult.status === 'completed') {
        const passedTests = taskResult.verifications
          .filter((v) => v.success)
          .map((v) => v.command)
          .join(', ');

        const modifiedFiles = taskResult.filesModified.join(', ');
        const contentLines = [
          `Task "${title}" completed successfully.`,
          task?.description ? `Approach: ${task.description}` : '',
          modifiedFiles ? `Modified files: ${modifiedFiles}.` : '',
          passedTests ? `Verified with: ${passedTests}.` : '',
        ]
          .filter(Boolean)
          .join(' ');

        candidates.push({
          category: 'experience',
          key: `exp.${sanitizedKeyBase}`,
          content: scrubSecrets(contentLines),
          projectId: options?.projectId ?? plan.projectId,
          sourceSessionId: options?.sessionId ?? result.sessionId,
          sourceType: 'verified_execution',
          confidence: 0.95,
          verificationStatus: 'verified',
          tags: ['execution', 'verified_solution', ...(task?.relevantFiles ?? [])],
          evidence: {
            planId: result.planId,
            taskId: taskResult.taskId,
            filesModified: taskResult.filesModified,
            verifications: taskResult.verifications,
            durationMs: taskResult.durationMs,
          },
        });
      } else if (taskResult.status === 'failed') {
        const failureReason = taskResult.error ?? 'Verification failed';
        const content = `Failed approach for "${title}": ${failureReason}. Do not repeat without addressing root cause.`;

        candidates.push({
          category: 'failed_attempt',
          key: `failed.${sanitizedKeyBase}`,
          content: scrubSecrets(content),
          projectId: options?.projectId ?? plan.projectId,
          sourceSessionId: options?.sessionId ?? result.sessionId,
          sourceType: 'failed_execution',
          confidence: 0.9,
          verificationStatus: 'verified',
          tags: ['execution', 'failed_attempt', 'postmortem'],
          evidence: {
            planId: result.planId,
            taskId: taskResult.taskId,
            error: failureReason,
            filesModified: taskResult.filesModified,
          },
        });
      }
    }

    return candidates;
  }

  /**
   * Identifies explicit user preferences from natural-language instructions.
   */
  public extractFromUserInstruction(
    text: string,
    options?: { projectId?: string } | undefined,
  ): MemoryExtractionCandidate | null {
    const trimmed = text.trim();

    // Regex patterns for explicit preference phrases
    const preferencePatterns = [
      /(?:always\s+use|never\s+use|i\s+prefer|prefer\s+using|please\s+use|make\s+sure\s+to\s+use)\s+(.+)/i,
      /(?:from\s+now\s+on|going\s+forward|remember\s+that|in\s+this\s+project\s+we\s+use)\s+(.+)/i,
      /(?:coding\s+style|convention|rule):\s*(.+)/i,
    ];

    let matched = false;
    for (const pat of preferencePatterns) {
      if (pat.test(trimmed)) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      return null;
    }

    // Determine category and key slug
    let keySlug = 'user_preference';
    const lower = trimmed.toLowerCase();
    if (lower.includes('test') || lower.includes('vitest') || lower.includes('jest')) {
      keySlug = 'testing.preference';
    } else if (lower.includes('pnpm') || lower.includes('npm') || lower.includes('yarn')) {
      keySlug = 'tooling.package_manager';
    } else if (lower.includes('lint') || lower.includes('eslint') || lower.includes('biome')) {
      keySlug = 'tooling.linter';
    } else if (lower.includes('style') || lower.includes('quote') || lower.includes('semicolon')) {
      keySlug = 'style.formatting';
    } else {
      keySlug = `pref.${lower.replace(/[^a-z0-9]+/g, '_').slice(0, 30)}`;
    }

    return {
      category: 'user_preference',
      key: keySlug,
      content: scrubSecrets(trimmed),
      projectId: options?.projectId,
      sourceType: 'explicit_user',
      confidence: 1.0,
      verificationStatus: 'verified',
      tags: ['user_preference', 'explicit'],
    };
  }

  /**
   * Extracts architectural decisions and tech-stack rules from repository intelligence findings.
   */
  public extractFromArchitecture(
    summary: ArchitectureSummary,
    projectId: string,
  ): MemoryExtractionCandidate[] {
    const candidates: MemoryExtractionCandidate[] = [];

    if (summary.architecture) {
      candidates.push({
        category: 'architecture_decision',
        key: 'arch.pattern',
        content: scrubSecrets(summary.architecture),
        projectId,
        sourceType: 'repo_inspection',
        confidence: 0.8,
        verificationStatus: 'proposed',
        tags: ['architecture', 'inspection'],
      });
    }

    if (summary.database) {
      candidates.push({
        category: 'architecture_decision',
        key: 'arch.database',
        content: scrubSecrets(summary.database),
        projectId,
        sourceType: 'repo_inspection',
        confidence: 0.85,
        verificationStatus: 'proposed',
        tags: ['database', 'inspection'],
      });
    }

    if (summary.frameworks && summary.frameworks.length > 0) {
      candidates.push({
        category: 'project_rule',
        key: 'project.frameworks',
        content: scrubSecrets(`Frameworks in use: ${summary.frameworks.join(', ')}`),
        projectId,
        sourceType: 'repo_inspection',
        confidence: 0.85,
        verificationStatus: 'proposed',
        tags: ['frameworks', 'tech_stack'],
      });
    }

    return candidates;
  }

  /**
   * Automatically consolidates extracted candidates into the memory store.
   */
  public consolidateAll(candidates: readonly MemoryExtractionCandidate[]): MemoryItem[] {
    if (!this.consolidator) {
      throw new Error('MemoryConsolidator is required to consolidate candidates');
    }

    const saved: MemoryItem[] = [];
    for (const cand of candidates) {
      const item = this.consolidator.consolidate(cand);
      saved.push(item);
    }
    return saved;
  }
}
