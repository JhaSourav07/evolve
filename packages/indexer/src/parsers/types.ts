export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'method'
  | 'variable'
  | 'enum';

export interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  lineStart: number;
  lineEnd: number;
  signature?: string | undefined;
  docstring?: string | undefined;
}

export interface ExtractedDependency {
  targetModule: string;
  importedSymbols: string[];
  isExternal: boolean;
}

export interface ExtractedExport {
  name: string;
  kind: SymbolKind | 'other';
  isDefault?: boolean | undefined;
}

export interface ParsedFileResult {
  symbols: ExtractedSymbol[];
  dependencies: ExtractedDependency[];
  exports: ExtractedExport[];
}

export interface LanguageParser {
  readonly id: string;
  canParse(filePath: string, language: string): boolean;
  parse(filePath: string, content: string): ParsedFileResult;
}
