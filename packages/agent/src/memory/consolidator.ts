import type {
  MemoryConflictAnalysis,
  MemoryExtractionCandidate,
  MemoryItem,
  MemorySourceType,
} from '@evolve/core';
import type { MemoryService } from '@evolve/db';
import { scrubSecrets } from '../tools/security.js';

const SOURCE_RELIABILITY_RANK: Record<MemorySourceType, number> = {
  explicit_user: 100,
  verified_execution: 80,
  user_feedback: 70,
  repo_inspection: 50,
  failed_execution: 50,
};

export class MemoryConsolidator {
  constructor(private readonly memoryService: MemoryService) {}

  /**
   * Analyzes potential conflicts, duplicates, and contradictions between
   * a candidate memory and existing stored knowledge.
   */
  public analyzeConflict(candidate: MemoryExtractionCandidate): MemoryConflictAnalysis {
    // 1. Check for exact key match
    const existingExact = this.memoryService.findByKey(candidate.key, candidate.projectId);
    if (existingExact) {
      if (existingExact.verificationStatus === 'deprecated') {
        return {
          hasConflict: false,
          resolution: 'supersede',
          conflictingMemoryId: existingExact.id,
          reason: 'Superseding a previously deprecated memory with a fresh entry.',
        };
      }

      const similarity = this.calculateContentSimilarity(
        candidate.content,
        existingExact.content,
      );

      // Highly similar content -> Duplicate / redundant
      if (similarity > 0.8) {
        return {
          hasConflict: false,
          conflictingMemoryId: existingExact.id,
          reason: 'Memory content already known with high similarity.',
          resolution: 'keep_existing',
        };
      }

      // Differing content on the exact same key -> Direct contradiction
      const candidateRank = SOURCE_RELIABILITY_RANK[candidate.sourceType] ?? 50;
      const existingRank =
        SOURCE_RELIABILITY_RANK[existingExact.sourceType as MemorySourceType] ?? 50;

      if (candidateRank >= existingRank) {
        return {
          hasConflict: true,
          conflictingMemoryId: existingExact.id,
          reason: `Candidate from '${candidate.sourceType}' (rank ${candidateRank}) supersedes existing memory from '${existingExact.sourceType}' (rank ${existingRank}).`,
          resolution: 'supersede',
        };
      }

      return {
        hasConflict: true,
        conflictingMemoryId: existingExact.id,
        reason: `Existing memory from higher-priority source '${existingExact.sourceType}' takes precedence over '${candidate.sourceType}'.`,
        resolution: 'reject_candidate',
      };
    }

    // 2. Check for semantic or near-duplicate matches across the same category & project
    const categoryMatches = this.memoryService
      .search(candidate.content.slice(0, 80), {
        projectId: candidate.projectId,
        category: candidate.category,
        includeDeprecated: false,
        limit: 5,
      })
      .filter((m) => m.category === candidate.category);

    for (const match of categoryMatches) {
      const sim = this.calculateContentSimilarity(candidate.content, match.content);
      if (sim > 0.85) {
        return {
          hasConflict: false,
          conflictingMemoryId: match.id,
          reason: `Near-identical memory already exists under key '${match.key}'.`,
          resolution: 'keep_existing',
        };
      }
    }

    return {
      hasConflict: false,
      resolution: 'supersede', // No conflict, proceed with creation
    };
  }

  /**
   * Consolidates a candidate memory into the persistent store, resolving conflicts,
   * deprecating superseded items, and ensuring secret scrubbing.
   */
  public consolidate(candidate: MemoryExtractionCandidate): MemoryItem {
    const analysis = this.analyzeConflict(candidate);

    const sanitizedContent = scrubSecrets(candidate.content);
    const sanitizedKey = scrubSecrets(candidate.key);

    if (analysis.resolution === 'keep_existing' && analysis.conflictingMemoryId) {
      const existing = this.memoryService.findById(analysis.conflictingMemoryId);
      if (existing) {
        this.memoryService.recordAccess(existing.id);
        return existing;
      }
    }

    if (analysis.resolution === 'reject_candidate' && analysis.conflictingMemoryId) {
      const existing = this.memoryService.findById(analysis.conflictingMemoryId);
      if (existing) {
        return existing;
      }
    }

    // Resolution is 'supersede' or new creation
    if (analysis.conflictingMemoryId && analysis.resolution === 'supersede') {
      this.memoryService.deprecate(analysis.conflictingMemoryId);
    }

    const newMemory = this.memoryService.saveMemory(
      candidate.category,
      sanitizedKey,
      sanitizedContent,
      {
        projectId: candidate.projectId,
        sourceSessionId: candidate.sourceSessionId,
        sourceType: candidate.sourceType,
        verificationStatus: candidate.verificationStatus,
        confidence: candidate.confidence,
        evidence: candidate.evidence,
        tags: candidate.tags,
      },
    );

    // If there was an existing conflicting memory that was superseded, link with supersededBy
    if (analysis.conflictingMemoryId && analysis.conflictingMemoryId !== newMemory.id) {
      this.memoryService.deprecate(analysis.conflictingMemoryId, newMemory.id);
    }

    return newMemory;
  }

  /**
   * Fast Jaccard word-set similarity metric between two strings.
   */
  private calculateContentSimilarity(textA: string, textB: string): number {
    const wordsA = new Set(
      textA
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
    const wordsB = new Set(
      textB
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );

    if (wordsA.size === 0 || wordsB.size === 0) {
      return 0;
    }

    let intersectionCount = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) {
        intersectionCount++;
      }
    }

    const unionSize = new Set([...wordsA, ...wordsB]).size;
    return unionSize === 0 ? 0 : intersectionCount / unionSize;
  }
}
