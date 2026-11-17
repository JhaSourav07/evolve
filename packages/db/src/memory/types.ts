import type {
  MemoryCategory,
  MemorySourceType,
  MemoryVerificationStatus,
} from '@evolve/core';

export type { MemoryCategory, MemorySourceType, MemoryVerificationStatus };

export interface MemoryItem {
  id: string;
  projectId?: string | null | undefined;
  category: MemoryCategory;
  key: string;
  content: string;
  tags?: string | null | undefined;
  confidence: number;
  sourceSessionId?: string | null | undefined;
  sourceEventId?: string | null | undefined;
  sourceType: MemorySourceType;
  verificationStatus: MemoryVerificationStatus;
  evidenceJson?: string | null | undefined;
  accessCount: number;
  lastAccessedAt: number;
  supersededBy?: string | null | undefined;
  createdAt: number;
  updatedAt: number;
}

export interface SaveMemoryOptions {
  projectId?: string | null | undefined;
  tags?: string[] | string | undefined;
  confidence?: number | undefined;
  sourceSessionId?: string | undefined;
  sourceEventId?: string | undefined;
  sourceType?: MemorySourceType | undefined;
  verificationStatus?: MemoryVerificationStatus | undefined;
  evidence?: Record<string, unknown> | undefined;
  supersededBy?: string | undefined;
}

export interface MemorySearchOptions {
  projectId?: string | undefined;
  category?: MemoryCategory | undefined;
  verificationStatus?: MemoryVerificationStatus | undefined;
  includeDeprecated?: boolean | undefined;
  limit?: number | undefined;
}

export interface MemorySearchResult extends MemoryItem {
  rank: number;
}
