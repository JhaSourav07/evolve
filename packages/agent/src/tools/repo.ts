import fs from 'node:fs';
import path from 'node:path';
import type { AgentTool } from '@evolve/core';
import { initDatabase, type EvolveDatabaseInstance } from '@evolve/db';
import {
  DependencyGraphEngine,
  formatProjectOverview,
  ProjectScanner,
  RepositoryIndexer,
  SymbolSearchEngine,
} from '@evolve/indexer';
import { z } from 'zod';
import { assertSafePath } from './security.js';

// Cache database instances per workspace root to avoid reopening sqlite repeatedly
const dbCache = new Map<string, EvolveDatabaseInstance>();

export function getWorkspaceDb(workspaceRoot: string, customInstance?: unknown): EvolveDatabaseInstance {
  if (customInstance && typeof customInstance === 'object' && 'sqlite' in customInstance) {
    return customInstance as EvolveDatabaseInstance;
  }

  const normalized = path.resolve(workspaceRoot);
  const cached = dbCache.get(normalized);
  if (cached) return cached;

  const evolveDir = path.join(normalized, '.evolve');
  if (!fs.existsSync(evolveDir)) {
    fs.mkdirSync(evolveDir, { recursive: true });
  }

  const dbFile = path.join(evolveDir, 'evolve.db');
  const instance = initDatabase({ path: dbFile });
  dbCache.set(normalized, instance);
  return instance;
}

export function getProjectId(workspaceRoot: string, contextProjectId?: string): string {
  if (contextProjectId) return contextProjectId;
  return `proj_${Buffer.from(workspaceRoot).toString('hex').slice(-12)}`;
}

export const inspectProjectTool: AgentTool<
  { targetPath?: string | undefined },
  { overview: string; totalFiles: number; primaryLanguage: string }
> = {
  definition: {
    name: 'inspect_project',
    description:
      'Inspects the repository structure, detecting languages, frameworks, package managers, manifests, and important directories.',
    parameters: z.object({
      targetPath: z
        .string()
        .optional()
        .describe('Relative path to inspect (defaults to workspace root)'),
    }),
  },
  async execute({ targetPath = '.' }, context) {
    try {
      const safePath = assertSafePath(targetPath, context.workspaceRoot);
      const scanner = new ProjectScanner();
      const result = await scanner.scan(safePath);
      const overview = formatProjectOverview(result);

      // Auto-index repository in background / incremental pass
      try {
        const db = getWorkspaceDb(context.workspaceRoot, context.database);
        const projectId = getProjectId(context.workspaceRoot, context.projectId);
        const indexer = new RepositoryIndexer(db.sqlite);
        await indexer.index(context.workspaceRoot, projectId);
      } catch {
        // Indexing failure is non-fatal for project inspection
      }

      return {
        success: true,
        output: overview,
        data: {
          overview,
          totalFiles: result.totalFiles,
          primaryLanguage: result.primaryLanguage,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to inspect project: ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};

export const getProjectStructureTool: AgentTool<
  { maxDepth?: number | undefined },
  { summary: string }
> = {
  definition: {
    name: 'get_project_structure',
    description:
      'Returns a clear overview of the repository hierarchy, important directories, configuration files, and documentation.',
    parameters: z.object({
      maxDepth: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum directory depth to explore (default 3)'),
    }),
  },
  async execute({ maxDepth = 3 }, context) {
    try {
      const scanner = new ProjectScanner();
      const result = await scanner.scan(context.workspaceRoot, { maxDepth });
      const overview = formatProjectOverview(result);

      return {
        success: true,
        output: overview,
        data: { summary: overview },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to get project structure: ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};

export const findSymbolTool: AgentTool<
  {
    name: string;
    kind?: 'function' | 'class' | 'interface' | 'type' | 'method' | 'variable' | 'enum' | undefined;
    exactMatch?: boolean | undefined;
  },
  { count: number }
> = {
  definition: {
    name: 'find_symbol',
    description:
      'Finds declarations of functions, classes, interfaces, types, and methods in repository source code with exact file and line locations.',
    parameters: z.object({
      name: z.string().min(1).describe('Symbol name to search for (e.g. AuthService, User, verifyToken)'),
      kind: z
        .enum(['function', 'class', 'interface', 'type', 'method', 'variable', 'enum'])
        .optional()
        .describe('Optional filter by symbol kind'),
      exactMatch: z
        .boolean()
        .optional()
        .describe('Whether to require exact symbol name match (default false)'),
    }),
  },
  async execute({ name, kind, exactMatch = false }, context) {
    try {
      const db = getWorkspaceDb(context.workspaceRoot, context.database);
      const projectId = getProjectId(context.workspaceRoot, context.projectId);

      // Ensure index is populated
      const indexer = new RepositoryIndexer(db.sqlite);
      await indexer.index(context.workspaceRoot, projectId);

      const symbolEngine = new SymbolSearchEngine(db.sqlite, context.workspaceRoot);
      const symbols = symbolEngine.findSymbols(name, {
        projectId,
        kind,
        exactMatch,
        maxResults: 30,
      });

      if (symbols.length === 0) {
        return {
          success: true,
          output: `No symbols found matching '${name}'${kind ? ` with kind '${kind}'` : ''}.`,
          data: { count: 0 },
        };
      }

      const lines = symbols.map((s) => {
        const sig = s.signature ? ` | ${s.signature}` : '';
        return `[${s.kind.toUpperCase()}] ${s.name} -> ${s.filePath}:${s.lineStart}-${s.lineEnd}${sig}`;
      });

      const output = `Found ${symbols.length} symbol(s) matching '${name}':\n${lines.join('\n')}`;

      return {
        success: true,
        output,
        data: { count: symbols.length },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to find symbol '${name}': ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};

export const findReferencesTool: AgentTool<
  { symbol: string },
  { count: number }
> = {
  definition: {
    name: 'find_references',
    description:
      'Finds all usages, call sites, and import locations of a symbol across repository source files.',
    parameters: z.object({
      symbol: z.string().min(1).describe('Symbol name to search references for (e.g. User, login)'),
    }),
  },
  async execute({ symbol }, context) {
    try {
      const db = getWorkspaceDb(context.workspaceRoot, context.database);
      const projectId = getProjectId(context.workspaceRoot, context.projectId);

      const indexer = new RepositoryIndexer(db.sqlite);
      await indexer.index(context.workspaceRoot, projectId);

      const symbolEngine = new SymbolSearchEngine(db.sqlite, context.workspaceRoot);
      const refs = symbolEngine.findReferences(symbol, {
        projectId,
        maxResults: 40,
      });

      if (refs.length === 0) {
        return {
          success: true,
          output: `No references found for symbol '${symbol}'.`,
          data: { count: 0 },
        };
      }

      const lines = refs.map((r) => {
        const tag = r.isImport ? '[IMPORT]' : '[USAGE]';
        return `${tag} ${r.filePath}:${r.line} ${r.lineContent}`;
      });

      const output = `Found ${refs.length} reference(s) to '${symbol}':\n${lines.join('\n')}`;

      return {
        success: true,
        output,
        data: { count: refs.length },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to find references for '${symbol}': ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};

export const getDependenciesTool: AgentTool<
  { path: string },
  { internalCount: number; externalCount: number }
> = {
  definition: {
    name: 'get_dependencies',
    description:
      'Inspects a file to list its imported external libraries, internal workspace modules, and reverse importers.',
    parameters: z.object({
      path: z.string().min(1).describe('Relative path to the source file to inspect'),
    }),
  },
  async execute({ path: targetPath }, context) {
    try {
      const safePath = assertSafePath(targetPath, context.workspaceRoot);
      const relPath = path.relative(context.workspaceRoot, safePath).replace(/\\/g, '/');

      const db = getWorkspaceDb(context.workspaceRoot, context.database);
      const projectId = getProjectId(context.workspaceRoot, context.projectId);

      const indexer = new RepositoryIndexer(db.sqlite);
      await indexer.index(context.workspaceRoot, projectId);

      const depEngine = new DependencyGraphEngine(db.sqlite);
      const deps = depEngine.getDependencies(relPath, projectId);

      const sections: string[] = [`Dependencies for ${relPath}:`];

      if (deps.externalDeps.length > 0) {
        sections.push('\nExternal Libraries:');
        for (const ext of deps.externalDeps) {
          const syms = ext.symbols.length > 0 ? ` (${ext.symbols.join(', ')})` : '';
          sections.push(`  - ${ext.module}${syms}`);
        }
      }

      if (deps.internalDeps.length > 0) {
        sections.push('\nInternal Modules:');
        for (const int of deps.internalDeps) {
          const syms = int.symbols.length > 0 ? ` (${int.symbols.join(', ')})` : '';
          sections.push(`  - ${int.module}${syms}`);
        }
      }

      if (deps.importers.length > 0) {
        sections.push('\nImported By (Reverse Importers):');
        for (const imp of deps.importers) {
          sections.push(`  - ${imp}`);
        }
      }

      const output = sections.join('\n');

      return {
        success: true,
        output,
        data: {
          internalCount: deps.internalDeps.length,
          externalCount: deps.externalDeps.length,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to get dependencies for '${targetPath}': ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};

export const getRelatedFilesTool: AgentTool<
  { path: string },
  { relatedFiles: string[] }
> = {
  definition: {
    name: 'get_related_files',
    description:
      'Finds related source files connected to a given file through import/export relationships and module boundaries.',
    parameters: z.object({
      path: z.string().min(1).describe('Relative path to the source file'),
    }),
  },
  async execute({ path: targetPath }, context) {
    try {
      const safePath = assertSafePath(targetPath, context.workspaceRoot);
      const relPath = path.relative(context.workspaceRoot, safePath).replace(/\\/g, '/');

      const db = getWorkspaceDb(context.workspaceRoot, context.database);
      const projectId = getProjectId(context.workspaceRoot, context.projectId);

      const indexer = new RepositoryIndexer(db.sqlite);
      await indexer.index(context.workspaceRoot, projectId);

      const depEngine = new DependencyGraphEngine(db.sqlite);
      const related = depEngine.getRelatedFiles(relPath, projectId);

      if (related.length === 0) {
        return {
          success: true,
          output: `No related files found for '${relPath}'.`,
          data: { relatedFiles: [] },
        };
      }

      const output = `Related files for '${relPath}':\n${related.map((f) => `  - ${f}`).join('\n')}`;

      return {
        success: true,
        output,
        data: { relatedFiles: related },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to get related files for '${targetPath}': ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};
