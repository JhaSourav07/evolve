import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { ContextRetriever } from '@evolve/indexer';

export interface RepositoryEvidence {
  projectRoot: string;
  frameworks: string[];
  relevantFiles: string[];
  relevantSymbols: string[];
  dependencies: Record<string, string>;
  existingConventions: string[];
  contextSummary: string;
}

export class RepoContextCollector {
  private readonly retriever: ContextRetriever;
  private readonly rootDir: string;

  constructor(
    private readonly sqlite: Database.Database,
    rootDir: string,
  ) {
    this.rootDir = path.resolve(rootDir);
    this.retriever = new ContextRetriever(sqlite, this.rootDir);
  }

  public async collectEvidence(
    query: string,
    projectId: string,
    options?: { maxTokens?: number; maxFiles?: number },
  ): Promise<RepositoryEvidence> {
    const maxTokens = options?.maxTokens ?? 2500;
    const maxFiles = options?.maxFiles ?? 6;

    // 1. Retrieve relevant code context via AST indexer
    const retrieved = await this.retriever.retrieve(query, {
      projectId,
      maxTokens,
      maxFiles,
    });

    const relevantFiles = retrieved.files.map((f) => f.path);

    // 2. Detect project dependencies and tech stack from package.json
    const packageJsonPath = path.join(this.rootDir, 'package.json');
    let dependencies: Record<string, string> = {};
    const frameworks: string[] = [];
    const conventions: string[] = [];

    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const allDeps = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
        };
        dependencies = allDeps;

        if (allDeps['express']) frameworks.push('Express');
        if (allDeps['fastify']) frameworks.push('Fastify');
        if (allDeps['next']) frameworks.push('Next.js');
        if (allDeps['react']) frameworks.push('React');
        if (allDeps['drizzle-orm']) frameworks.push('Drizzle ORM');
        if (allDeps['prisma']) frameworks.push('Prisma');
        if (allDeps['typescript']) frameworks.push('TypeScript');

        if (allDeps['vitest']) conventions.push('Testing with Vitest');
        if (allDeps['jest']) conventions.push('Testing with Jest');
        if (allDeps['eslint']) conventions.push('Linting with ESLint');
        if (allDeps['prettier']) conventions.push('Formatting with Prettier');
      } catch {
        // ignore malformed package.json
      }
    }

    // 3. Query indexed symbols matching query terms
    const relevantSymbols: string[] = [];
    try {
      const terms = query
        .replace(/[^a-zA-Z0-9_]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3);

      for (const term of terms.slice(0, 5)) {
        const rows = this.sqlite
          .prepare(
            `SELECT name, kind, path FROM repo_symbols
             JOIN repo_files ON repo_symbols.file_id = repo_files.id
             WHERE repo_symbols.project_id = ? AND repo_symbols.name LIKE ?
             LIMIT 5`,
          )
          .all(projectId, `%${term}%`) as Array<{ name: string; kind: string; path: string }>;

        for (const row of rows) {
          relevantSymbols.push(`${row.kind} ${row.name} in ${row.path}`);
        }
      }
    } catch {
      // index might be empty or unmigrated
    }

    // 4. Synthesize context summary
    const sections: string[] = [];
    if (frameworks.length > 0) {
      sections.push(`Detected Frameworks & Libraries: ${frameworks.join(', ')}`);
    }
    if (conventions.length > 0) {
      sections.push(`Existing Conventions:\n${conventions.map((c) => `- ${c}`).join('\n')}`);
    }
    if (relevantSymbols.length > 0) {
      sections.push(`Existing Repository Symbols:\n${relevantSymbols.slice(0, 10).map((s) => `- ${s}`).join('\n')}`);
    }
    if (retrieved.formattedContext) {
      sections.push(`Relevant File Excerpts:\n${retrieved.formattedContext}`);
    }

    return {
      projectRoot: this.rootDir,
      frameworks,
      relevantFiles,
      relevantSymbols,
      dependencies,
      existingConventions: conventions,
      contextSummary: sections.join('\n\n'),
    };
  }
}
