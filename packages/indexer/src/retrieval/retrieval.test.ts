import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDatabase, type EvolveDatabaseInstance } from '@evolve/db';
import { RepositoryIndexer } from '../indexer/incremental.js';
import { CodeSearchEngine } from '../search/code-search.js';
import { DependencyGraphEngine } from '../search/dependency-graph.js';
import { SymbolSearchEngine } from '../search/symbol-search.js';
import { ContextRetriever } from './retriever.js';

describe('Code Search & Context Retrieval', () => {
  let tempDir: string;
  let dbInstance: EvolveDatabaseInstance;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-retrieval-test-'));
    dbInstance = initDatabase({ path: ':memory:' });

    dbInstance.sqlite
      .prepare(
        'INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run('proj_test', 'Test Project', tempDir, Date.now(), Date.now());

    // Setup realistic repository files
    fs.mkdirSync(path.join(tempDir, 'src', 'auth'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'src', 'models'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'src', 'api'), { recursive: true });

    // File 1: src/models/user.ts
    fs.writeFileSync(
      path.join(tempDir, 'src', 'models', 'user.ts'),
      `export interface User {
  id: string;
  username: string;
  passwordHash: string;
}

export class UserModel {
  public static findByUsername(username: string): User | null {
    return null;
  }
}
`,
    );

    // File 2: src/auth/service.ts
    fs.writeFileSync(
      path.join(tempDir, 'src', 'auth', 'service.ts'),
      `import { User, UserModel } from '../models/user.js';
import jwt from 'jsonwebtoken';

export class AuthService {
  public async login(username: string, pass: string): Promise<string> {
    const user = UserModel.findByUsername(username);
    if (!user) throw new Error("Invalid");
    return jwt.sign({ id: user.id }, "secret");
  }
}
`,
    );

    // File 3: src/api/routes.ts
    fs.writeFileSync(
      path.join(tempDir, 'src', 'api', 'routes.ts'),
      `import { AuthService } from '../auth/service.js';
import express from 'express';

export const app = express();
const authService = new AuthService();

app.post('/login', async (req, res) => {
  const token = await authService.login(req.body.user, req.body.pass);
  res.json({ token });
});
`,
    );

    // Run indexer once
    const indexer = new RepositoryIndexer(dbInstance.sqlite);
    await indexer.index(tempDir, 'proj_test');
  });

  afterEach(() => {
    dbInstance.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('searches code using FTS5 and returns line numbers', () => {
    const searchEngine = new CodeSearchEngine(dbInstance.sqlite, tempDir);
    const results = searchEngine.search('jwt.sign', { projectId: 'proj_test' });

    expect(results.matches.length).toBeGreaterThanOrEqual(1);
    const match = results.matches[0];
    expect(match?.file).toBe('src/auth/service.ts');
    expect(match?.line).toBe(8);
    expect(match?.text).toContain('jwt.sign');
  });

  it('searches symbols and finds references across modules', () => {
    const symbolEngine = new SymbolSearchEngine(dbInstance.sqlite, tempDir);

    // Find User symbol
    const userSymbols = symbolEngine.findSymbols('User', { projectId: 'proj_test' });
    expect(userSymbols.some((s) => s.name === 'User' && s.kind === 'interface')).toBe(true);
    expect(userSymbols.some((s) => s.name === 'UserModel' && s.kind === 'class')).toBe(true);

    // Find references to AuthService
    const refs = symbolEngine.findReferences('AuthService', { projectId: 'proj_test' });
    expect(refs.length).toBeGreaterThanOrEqual(2);
    expect(refs.some((r) => r.filePath === 'src/api/routes.ts' && r.isImport)).toBe(true);
  });

  it('traces dependency graph between modules and reverse importers', () => {
    const depEngine = new DependencyGraphEngine(dbInstance.sqlite);
    const deps = depEngine.getDependencies('src/auth/service.ts', 'proj_test');

    expect(deps.externalDeps.some((d) => d.module === 'jsonwebtoken')).toBe(true);
    expect(deps.internalDeps.some((d) => d.module === '../models/user.js')).toBe(true);
    expect(deps.importers).toContain('src/api/routes.ts');

    const related = depEngine.getRelatedFiles('src/auth/service.ts', 'proj_test');
    expect(related).toContain('src/api/routes.ts');
  });

  it('retrieves compact prioritized context for an authentication query within token budget', async () => {
    const retriever = new ContextRetriever(dbInstance.sqlite, tempDir);
    const result = await retriever.retrieve('Analyse the authentication system', {
      projectId: 'proj_test',
      maxTokens: 2000,
      maxFiles: 5,
    });

    expect(result.files.length).toBeGreaterThanOrEqual(2);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('src/auth/service.ts');
    expect(paths).toContain('src/models/user.ts');

    expect(result.formattedContext).toContain('--- File: src/auth/service.ts');
    expect(result.formattedContext).toContain('export class AuthService');
    expect(result.estimatedTokens).toBeLessThan(2000);
  });
});
