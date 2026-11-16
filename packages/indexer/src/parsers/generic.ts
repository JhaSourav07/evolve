import path from 'node:path';
import type {
  ExtractedDependency,
  ExtractedExport,
  ExtractedSymbol,
  LanguageParser,
  ParsedFileResult,
} from './types.js';

export class GenericRegexParser implements LanguageParser {
  public readonly id = 'generic-regex';

  public canParse(filePath: string, language: string): boolean {
    const supportedLangs = ['python', 'rust', 'go', 'java', 'c', 'cpp', 'csharp', 'dart'];
    if (supportedLangs.includes(language)) return true;
    const ext = path.extname(filePath).toLowerCase();
    return ['.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.dart'].includes(ext);
  }

  public parse(filePath: string, content: string): ParsedFileResult {
    const ext = path.extname(filePath).toLowerCase();
    const lines = content.split('\n');

    const symbols: ExtractedSymbol[] = [];
    const dependencies: ExtractedDependency[] = [];
    const exportsList: ExtractedExport[] = [];

    if (ext === '.py') {
      this.parsePython(lines, symbols, dependencies, exportsList);
    } else if (ext === '.rs') {
      this.parseRust(lines, symbols, dependencies, exportsList);
    } else if (ext === '.go') {
      this.parseGo(lines, symbols, dependencies, exportsList);
    } else {
      this.parseGenericCStyle(lines, symbols, dependencies, exportsList);
    }

    return {
      symbols,
      dependencies,
      exports: exportsList,
    };
  }

  private parsePython(
    lines: string[],
    symbols: ExtractedSymbol[],
    dependencies: ExtractedDependency[],
    exportsList: ExtractedExport[],
  ) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const lineNum = i + 1;

      // def foo(...):
      const funcMatch = line.match(/^([ \t]*)def\s+([a-zA-Z0-9_]+)\s*\((.*?)\)/);
      if (funcMatch && funcMatch[2]) {
        const isMethod = (funcMatch[1]?.length ?? 0) > 0;
        const name = funcMatch[2];
        symbols.push({
          name,
          kind: isMethod ? 'method' : 'function',
          lineStart: lineNum,
          lineEnd: lineNum,
          signature: line.trim(),
        });
        if (!name.startsWith('_') && !isMethod) {
          exportsList.push({ name, kind: 'function' });
        }
      }

      // class Foo(...):
      const classMatch = line.match(/^class\s+([a-zA-Z0-9_]+)/);
      if (classMatch && classMatch[1]) {
        const name = classMatch[1];
        symbols.push({
          name,
          kind: 'class',
          lineStart: lineNum,
          lineEnd: lineNum,
          signature: line.trim(),
        });
        exportsList.push({ name, kind: 'class' });
      }

      // from x import y
      const fromMatch = line.match(/^from\s+([a-zA-Z0-9_.]+)\s+import\s+(.+)$/);
      if (fromMatch && fromMatch[1] && fromMatch[2]) {
        const targetModule = fromMatch[1];
        const importedSymbols = fromMatch[2]
          .split(',')
          .map((s) => s.trim().split(/\s+as\s+/)[0] ?? '')
          .filter(Boolean);
        dependencies.push({
          targetModule,
          importedSymbols,
          isExternal: !targetModule.startsWith('.'),
        });
      }

      // import x
      const importMatch = line.match(/^import\s+([a-zA-Z0-9_., ]+)$/);
      if (importMatch && importMatch[1]) {
        const modules = importMatch[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0] ?? '');
        for (const mod of modules) {
          if (mod) {
            dependencies.push({
              targetModule: mod,
              importedSymbols: [mod],
              isExternal: !mod.startsWith('.'),
            });
          }
        }
      }
    }
  }

  private parseRust(
    lines: string[],
    symbols: ExtractedSymbol[],
    dependencies: ExtractedDependency[],
    exportsList: ExtractedExport[],
  ) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const lineNum = i + 1;

      // fn foo(...) / pub fn foo(...)
      const fnMatch = line.match(/(pub(\s*\(.*?\))?\s+)?fn\s+([a-zA-Z0-9_]+)\s*(<.*?>)?\s*\(/);
      if (fnMatch && fnMatch[3]) {
        const isPub = Boolean(fnMatch[1]);
        const name = fnMatch[3];
        symbols.push({
          name,
          kind: 'function',
          lineStart: lineNum,
          lineEnd: lineNum,
          signature: line.trim().replace(/\{.*$/, '').trim(),
        });
        if (isPub) exportsList.push({ name, kind: 'function' });
      }

      // struct Foo / pub struct Foo
      const structMatch = line.match(/(pub(\s*\(.*?\))?\s+)?struct\s+([a-zA-Z0-9_]+)/);
      if (structMatch && structMatch[3]) {
        const isPub = Boolean(structMatch[1]);
        const name = structMatch[3];
        symbols.push({
          name,
          kind: 'class',
          lineStart: lineNum,
          lineEnd: lineNum,
          signature: line.trim(),
        });
        if (isPub) exportsList.push({ name, kind: 'class' });
      }

      // enum Foo / pub enum Foo
      const enumMatch = line.match(/(pub(\s*\(.*?\))?\s+)?enum\s+([a-zA-Z0-9_]+)/);
      if (enumMatch && enumMatch[3]) {
        const isPub = Boolean(enumMatch[1]);
        const name = enumMatch[3];
        symbols.push({
          name,
          kind: 'enum',
          lineStart: lineNum,
          lineEnd: lineNum,
          signature: line.trim(),
        });
        if (isPub) exportsList.push({ name, kind: 'enum' });
      }

      // trait Foo
      const traitMatch = line.match(/(pub(\s*\(.*?\))?\s+)?trait\s+([a-zA-Z0-9_]+)/);
      if (traitMatch && traitMatch[3]) {
        const isPub = Boolean(traitMatch[1]);
        const name = traitMatch[3];
        symbols.push({
          name,
          kind: 'interface',
          lineStart: lineNum,
          lineEnd: lineNum,
          signature: line.trim(),
        });
        if (isPub) exportsList.push({ name, kind: 'interface' });
      }

      // use foo::bar;
      const useMatch = line.match(/use\s+([a-zA-Z0-9_:]+)(::\{([^}]+)\})?;/);
      if (useMatch && useMatch[1]) {
        const mod = useMatch[1];
        const items = useMatch[3]
          ? useMatch[3].split(',').map((s) => s.trim())
          : [mod.split('::').pop() ?? ''];
        dependencies.push({
          targetModule: mod,
          importedSymbols: items,
          isExternal: !mod.startsWith('crate::') && !mod.startsWith('super::'),
        });
      }
    }
  }

  private parseGo(
    lines: string[],
    symbols: ExtractedSymbol[],
    dependencies: ExtractedDependency[],
    exportsList: ExtractedExport[],
  ) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const lineNum = i + 1;

      // func Foo(...) or func (r *Receiver) Foo(...)
      const fnMatch = line.match(/func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/);
      if (fnMatch && fnMatch[1]) {
        const name = fnMatch[1];
        const isExported = name[0] !== undefined && name[0] === name[0].toUpperCase();
        symbols.push({
          name,
          kind: 'function',
          lineStart: lineNum,
          lineEnd: lineNum,
          signature: line.trim().replace(/\{.*$/, '').trim(),
        });
        if (isExported) exportsList.push({ name, kind: 'function' });
      }

      // type Foo struct / type Foo interface
      const typeMatch = line.match(/type\s+([a-zA-Z0-9_]+)\s+(struct|interface)/);
      if (typeMatch && typeMatch[1] && typeMatch[2]) {
        const name = typeMatch[1];
        const kind = typeMatch[2] === 'struct' ? 'class' : 'interface';
        const isExported = name[0] !== undefined && name[0] === name[0].toUpperCase();
        symbols.push({
          name,
          kind,
          lineStart: lineNum,
          lineEnd: lineNum,
          signature: line.trim(),
        });
        if (isExported) exportsList.push({ name, kind });
      }

      // import "foo/bar"
      const singleImport = line.match(/import\s+["']([^"']+)["']/);
      if (singleImport && singleImport[1]) {
        dependencies.push({
          targetModule: singleImport[1],
          importedSymbols: [singleImport[1].split('/').pop() ?? ''],
          isExternal: !singleImport[1].startsWith('.'),
        });
      }
    }
  }

  private parseGenericCStyle(
    lines: string[],
    symbols: ExtractedSymbol[],
    dependencies: ExtractedDependency[],
    exportsList: ExtractedExport[],
  ) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const lineNum = i + 1;

      // class Foo or interface Foo
      const classMatch = line.match(/(?:public|private|protected)?\s*(?:static\s+)?(class|interface)\s+([a-zA-Z0-9_]+)/);
      if (classMatch && classMatch[1] && classMatch[2]) {
        const kind = classMatch[1] === 'class' ? 'class' : 'interface';
        const name = classMatch[2];
        symbols.push({
          name,
          kind,
          lineStart: lineNum,
          lineEnd: lineNum,
          signature: line.trim(),
        });
        exportsList.push({ name, kind });
      }

      // #include <...> or #include "..."
      const includeMatch = line.match(/#include\s+["<]([^">]+)[">]/);
      if (includeMatch && includeMatch[1]) {
        dependencies.push({
          targetModule: includeMatch[1],
          importedSymbols: ['*'],
          isExternal: line.includes('<'),
        });
      }
    }
  }
}
