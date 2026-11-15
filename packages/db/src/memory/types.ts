export type MemoryCategory =
  'user_preference' | 'project_rule' | 'api_convention' | 'experience' | 'reflexion' | string;

export interface MemoryItem {
  id: string;
  projectId?: string | null | undefined;
  category: MemoryCategory;
  key: string;
  content: string;
  tags?: string | null | undefined;
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

export interface SaveMemoryOptions {
  projectId?: string | undefined;
  tags?: string[] | string | undefined;
  confidence?: number | undefined;
}

export interface MemorySearchOptions {
  projectId?: string | undefined;
  category?: MemoryCategory | undefined;
  limit?: number | undefined;
}

export interface MemorySearchResult extends MemoryItem {
  rank: number;
}
