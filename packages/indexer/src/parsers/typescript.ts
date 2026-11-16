import ts from 'typescript';
import path from 'node:path';
import type {
  ExtractedDependency,
  ExtractedExport,
  ExtractedSymbol,
  LanguageParser,
  ParsedFileResult,
  SymbolKind,
} from './types.js';

export class TypeScriptAstParser implements LanguageParser {
  public readonly id = 'typescript-ast';

  public canParse(filePath: string, language: string): boolean {
    if (language === 'typescript' || language === 'javascript') {
      return true;
    }
    const ext = path.extname(filePath).toLowerCase();
    return ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'].includes(ext);
  }

  public parse(filePath: string, content: string): ParsedFileResult {
    const ext = path.extname(filePath).toLowerCase();
    let scriptKind = ts.ScriptKind.TS;
    if (ext === '.tsx') scriptKind = ts.ScriptKind.TSX;
    else if (ext === '.jsx') scriptKind = ts.ScriptKind.JSX;
    else if (['.js', '.mjs', '.cjs'].includes(ext)) scriptKind = ts.ScriptKind.JS;

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true, // setParentNodes
      scriptKind,
    );

    const symbols: ExtractedSymbol[] = [];
    const dependencies: ExtractedDependency[] = [];
    const exportsList: ExtractedExport[] = [];

    const getLineNumber = (pos: number): number => {
      return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
    };

    const extractDocstring = (node: ts.Node): string | undefined => {
      const fullText = sourceFile.getFullText();
      const comments = ts.getLeadingCommentRanges(fullText, node.getFullStart());
      if (comments && comments.length > 0) {
        const lastComment = comments[comments.length - 1];
        if (lastComment) {
          return fullText.slice(lastComment.pos, lastComment.end).trim();
        }
      }
      return undefined;
    };

    const extractSignature = (node: ts.Node): string => {
      const text = node.getText(sourceFile);
      const firstLine = text.split('\n')[0] ?? '';
      return firstLine.replace(/\{.*$/, '').trim();
    };

    const addSymbol = (
      name: string,
      kind: SymbolKind,
      node: ts.Node,
      signature?: string,
    ) => {
      symbols.push({
        name,
        kind,
        lineStart: getLineNumber(node.getStart(sourceFile)),
        lineEnd: getLineNumber(node.getEnd()),
        signature: signature ?? extractSignature(node),
        docstring: extractDocstring(node),
      });
    };

    const visit = (node: ts.Node) => {
      // 1. Function Declarations
      if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.text;
        addSymbol(name, 'function', node);
        if (hasExportModifier(node)) {
          exportsList.push({ name, kind: 'function' });
        }
      }

      // 2. Class Declarations
      else if (ts.isClassDeclaration(node) && node.name) {
        const name = node.name.text;
        addSymbol(name, 'class', node);
        if (hasExportModifier(node)) {
          exportsList.push({ name, kind: 'class' });
        }

        // Methods & Properties inside Class
        for (const member of node.members) {
          if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
            addSymbol(`${name}.${member.name.text}`, 'method', member);
          } else if (ts.isConstructorDeclaration(member)) {
            addSymbol(`${name}.constructor`, 'method', member);
          }
        }
      }

      // 3. Interface Declarations
      else if (ts.isInterfaceDeclaration(node)) {
        const name = node.name.text;
        addSymbol(name, 'interface', node);
        if (hasExportModifier(node)) {
          exportsList.push({ name, kind: 'interface' });
        }
      }

      // 4. Type Aliases
      else if (ts.isTypeAliasDeclaration(node)) {
        const name = node.name.text;
        addSymbol(name, 'type', node);
        if (hasExportModifier(node)) {
          exportsList.push({ name, kind: 'type' });
        }
      }

      // 5. Enums
      else if (ts.isEnumDeclaration(node)) {
        const name = node.name.text;
        addSymbol(name, 'enum', node);
        if (hasExportModifier(node)) {
          exportsList.push({ name, kind: 'enum' });
        }
      }

      // 6. Variable Declarations (const / let / var, including arrow functions)
      else if (ts.isVariableStatement(node)) {
        const isExported = hasExportModifier(node);
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const name = decl.name.text;
            const init = decl.initializer;
            const isFn =
              init &&
              (ts.isArrowFunction(init) ||
                ts.isFunctionExpression(init) ||
                (ts.isCallExpression(init) && init.expression.getText(sourceFile).includes('define')));

            const kind: SymbolKind = isFn ? 'function' : 'variable';
            addSymbol(name, kind, decl);
            if (isExported) {
              exportsList.push({ name, kind });
            }
          }
        }
      }

      // 7. Import Declarations
      else if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (ts.isStringLiteral(moduleSpecifier)) {
          const targetModule = moduleSpecifier.text;
          const importedSymbols: string[] = [];

          if (node.importClause) {
            // Default import: import foo from 'bar'
            if (node.importClause.name) {
              importedSymbols.push(node.importClause.name.text);
            }
            // Named or namespace bindings
            if (node.importClause.namedBindings) {
              if (ts.isNamedImports(node.importClause.namedBindings)) {
                for (const element of node.importClause.namedBindings.elements) {
                  importedSymbols.push(element.name.text);
                }
              } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                importedSymbols.push(node.importClause.namedBindings.name.text);
              }
            }
          }

          const isExternal = !targetModule.startsWith('.') && !targetModule.startsWith('/');
          dependencies.push({
            targetModule,
            importedSymbols,
            isExternal,
          });
        }
      }

      // 8. Export Declarations (e.g. export { a, b } from './c')
      else if (ts.isExportDeclaration(node)) {
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            exportsList.push({ name: el.name.text, kind: 'other' });
          }
        }
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const targetModule = node.moduleSpecifier.text;
          const isExternal = !targetModule.startsWith('.') && !targetModule.startsWith('/');
          dependencies.push({
            targetModule,
            importedSymbols: node.exportClause && ts.isNamedExports(node.exportClause)
              ? node.exportClause.elements.map((e) => e.name.text)
              : ['*'],
            isExternal,
          });
        }
      }

      // 9. Export Default Assignment (e.g. export default foo)
      else if (ts.isExportAssignment(node)) {
        const name = node.expression.getText(sourceFile);
        exportsList.push({ name, kind: 'other', isDefault: true });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return {
      symbols,
      dependencies,
      exports: exportsList,
    };
  }
}

function hasExportModifier(node: ts.Node): boolean {
  if (!('modifiers' in node) || !Array.isArray(node.modifiers)) return false;
  return node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}
