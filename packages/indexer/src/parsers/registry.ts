import { GenericRegexParser } from './generic.js';
import type { LanguageParser, ParsedFileResult } from './types.js';
import { TypeScriptAstParser } from './typescript.js';

export class ParserRegistry {
  private readonly parsers: LanguageParser[] = [];

  constructor() {
    // Register standard parsers (TypeScript first, then generic fallback)
    this.parsers.push(new TypeScriptAstParser());
    this.parsers.push(new GenericRegexParser());
  }

  public register(parser: LanguageParser): void {
    this.parsers.unshift(parser);
  }

  public getParser(filePath: string, language: string): LanguageParser | undefined {
    return this.parsers.find((p) => p.canParse(filePath, language));
  }

  public parseFile(filePath: string, content: string, language: string): ParsedFileResult {
    const parser = this.getParser(filePath, language);
    if (!parser) {
      return {
        symbols: [],
        dependencies: [],
        exports: [],
      };
    }
    return parser.parse(filePath, content);
  }
}
