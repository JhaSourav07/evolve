import type { SymbolKind } from '../parsers/types.js';

export interface CodeMatch {
  file: string;
  line: number;
  text: string;
  snippet?: string | undefined;
}

export interface CodeSearchResult {
  query: string;
  matches: CodeMatch[];
  totalMatches: number;
}

export interface CodeSearchOptions {
  projectId?: string | undefined;
  pathFilter?: string | undefined;
  maxResults?: number | undefined;
  isRegex?: boolean | undefined;
}

export interface SymbolMatch {
  id: string;
  name: string;
  kind: SymbolKind;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  signature?: string | undefined;
  docstring?: string | undefined;
}

export interface SymbolSearchOptions {
  projectId?: string | undefined;
  kind?: SymbolKind | undefined;
  exactMatch?: boolean | undefined;
  maxResults?: number | undefined;
}

export interface ReferenceMatch {
  symbolName: string;
  filePath: string;
  line: number;
  lineContent: string;
  isImport: boolean;
}

export interface FileDependencies {
  filePath: string;
  internalDeps: Array<{ module: string; symbols: string[] }>;
  externalDeps: Array<{ module: string; symbols: string[] }>;
  importers: string[]; // Files that import this file
}
