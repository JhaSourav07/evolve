import { z } from 'zod';

export const MemoryCategorySchema = z.enum([
  'user_preference',
  'project_rule',
  'architecture_decision',
  'experience',
  'failed_attempt',
]);
export type MemoryCategory = z.infer<typeof MemoryCategorySchema>;

export const MemorySourceTypeSchema = z.enum([
  'explicit_user',
  'verified_execution',
  'failed_execution',
  'user_feedback',
  'repo_inspection',
]);
export type MemorySourceType = z.infer<typeof MemorySourceTypeSchema>;

export const MemoryVerificationStatusSchema = z.enum([
  'verified',
  'proposed',
  'deprecated',
  'rejected',
]);
export type MemoryVerificationStatus = z.infer<typeof MemoryVerificationStatusSchema>;

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  key: string;
  content: string;
  projectId?: string | null | undefined;
  sourceSessionId?: string | null | undefined;
  sourceEventId?: string | null | undefined;
  sourceType?: MemorySourceType | undefined;
  confidence: number;
  verificationStatus: MemoryVerificationStatus;
  evidence?: Record<string, unknown> | undefined;
  evidenceJson?: string | null | undefined;
  tags?: string | null | undefined;
  accessCount: number;
  lastAccessedAt: number;
  supersededBy?: string | null | undefined;
  createdAt: number;
  updatedAt: number;
}

export interface MemorySearchFilter {
  query?: string | undefined;
  projectId?: string | undefined;
  categories?: MemoryCategory[] | undefined;
  verificationStatuses?: MemoryVerificationStatus[] | undefined;
  minConfidence?: number | undefined;
  limit?: number | undefined;
}

export interface MemorySearchResult extends MemoryItem {
  relevanceScore: number;
  matchedTerms?: string[] | undefined;
}

export interface MemoryExtractionCandidate {
  category: MemoryCategory;
  key: string;
  content: string;
  projectId?: string | undefined;
  sourceSessionId?: string | undefined;
  sourceType: MemorySourceType;
  confidence: number;
  verificationStatus: MemoryVerificationStatus;
  evidence?: Record<string, unknown> | undefined;
  tags?: string[] | undefined;
}

export interface MemoryConflictAnalysis {
  hasConflict: boolean;
  conflictingMemoryId?: string | undefined;
  reason?: string | undefined;
  resolution: 'supersede' | 'merge' | 'keep_existing' | 'reject_candidate';
}

export interface MemoryRetrievalContext {
  prompt: string;
  projectId: string;
  relevantFiles?: string[] | undefined;
  maxTokens?: number | undefined;
  minConfidence?: number | undefined;
}
