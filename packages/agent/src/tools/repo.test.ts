import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDatabase, type EvolveDatabaseInstance } from '@evolve/db';
import { noopLogger, createSessionId } from '@evolve/core';
import {
  findReferencesTool,
  findSymbolTool,
  getDependenciesTool,
  getProjectStructureTool,
  getRelatedFilesTool,
  inspectProjectTool,
} from './repo.js';
import { listFilesTool, readFileTool } from './filesystem.js';

describe('Repository Intelligence Agent Tools', () => {
  let tempDir: string;
  let dbInstance: EvolveDatabaseInstance;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-repo-tools-test-'));
    dbInstance = initDatabase({ path: ':memory:' });

    dbInstance.sqlite
      .prepare(
        'INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run('proj_test', 'Tool Test Proj', tempDir, Date.now(), Date.now());

    // Setup sample files
    fs.mkdirSync(path.join(tempDir, 'src', 'auth'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'src', 'models'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'node_modules', 'foo'), { recursive: true });

    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'sample-app' }));
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'ignored/\n');

    // src/models/user.ts
    fs.writeFileSync(
      path.join(tempDir, 'src', 'models', 'user.ts'),
      `export interface User {
  id: string;
  name: string;
}

export class UserModel {
  public static find(): User[] { return []; }
}
`,
    );

    // src/auth/service.ts
    fs.writeFileSync(
      path.join(tempDir, 'src', 'auth', 'service.ts'),
      `import { User, UserModel } from '../models/user.js';

export class AuthService {
  public authenticate(name: string): User | null {
    const list = UserModel.find();
    return list[0] ?? null;
  }
}
`,
    );

    // Ignored / binary files
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'foo', 'index.js'), '');
    fs.writeFileSync(path.join(tempDir, '.env'), 'SECRET=123');
  });

  afterEach(() => {
    dbInstance.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const getContext = () => ({
    sessionId: createSessionId(),
    workspaceRoot: tempDir,
    logger: noopLogger,
    projectId: 'proj_test',
    database: dbInstance,
  });

  it('inspects project and returns structured overview', async () => {
    const res = await inspectProjectTool.execute({}, getContext());
    expect(res.success).toBe(true);
    expect(res.output).toContain('Project: sample-app');
    expect(res.output).toContain('Important directories:');
    expect(res.output).toContain('src/');
  });

  it('gets project structure', async () => {
    const res = await getProjectStructureTool.execute({}, getContext());
    expect(res.success).toBe(true);
    expect(res.output).toContain('Configuration:');
    expect(res.output).toContain('package.json');
  });

  it('finds symbols by name and kind', async () => {
    const res = await findSymbolTool.execute({ name: 'User' }, getContext());
    expect(res.success).toBe(true);
    expect(res.output).toContain('[INTERFACE] User');
    expect(res.output).toContain('[CLASS] UserModel');
  });

  it('finds references to a symbol across modules', async () => {
    const res = await findReferencesTool.execute({ symbol: 'UserModel' }, getContext());
    expect(res.success).toBe(true);
    expect(res.output).toContain('[IMPORT] src/auth/service.ts');
    expect(res.output).toContain('UserModel.find');
  });

  it('gets module dependencies and reverse importers', async () => {
    const res = await getDependenciesTool.execute({ path: 'src/auth/service.ts' }, getContext());
    expect(res.success).toBe(true);
    expect(res.output).toContain('../models/user.js');
    expect(res.output).toContain('User, UserModel');
  });

  it('finds related files', async () => {
    const res = await getRelatedFilesTool.execute({ path: 'src/auth/service.ts' }, getContext());
    expect(res.success).toBe(true);
    expect(res.output).toContain('src/models/user.ts');
  });

  it('reads file with line range slicing', async () => {
    const res = await readFileTool.execute(
      { path: 'src/models/user.ts', startLine: 2, endLine: 4 },
      getContext(),
    );
    expect(res.success).toBe(true);
    expect(res.output).toContain('2:   id: string;');
    expect(res.output).toContain('3:   name: string;');
    expect(res.output).toContain('4: }');
    expect(res.output).not.toContain('export interface User');
  });

  it('lists files while respecting ignore filter', async () => {
    const res = await listFilesTool.execute({ recursive: true }, getContext());
    expect(res.success).toBe(true);
    expect(res.output).toContain('src/models/user.ts');
    expect(res.output).not.toContain('node_modules');
    expect(res.output).not.toContain('.env');
  });

  it('blocks path traversal attacks on repository tools', async () => {
    const resDep = await getDependenciesTool.execute(
      { path: '../../../../etc/passwd' },
      getContext(),
    );
    expect(resDep.success).toBe(false);
    expect(resDep.output).toContain('Path traversal attempt detected');

    const resRel = await getRelatedFilesTool.execute(
      { path: '../../../secret.txt' },
      getContext(),
    );
    expect(resRel.success).toBe(false);
    expect(resRel.output).toContain('Path traversal attempt detected');
  });

  it('handles large repositories without memory exhaustion', async () => {
    // Generate 150 source files in a large-repo test directory
    const largeDir = path.join(tempDir, 'large-repo');
    fs.mkdirSync(largeDir, { recursive: true });

    // Insert project in DB
    dbInstance.sqlite
      .prepare('INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('proj_large', 'Large Proj', largeDir, Date.now(), Date.now());

    for (let i = 0; i < 150; i++) {
      fs.writeFileSync(
        path.join(largeDir, `module_${i}.ts`),
        `export function fn_${i}(val: number): number { return val + ${i}; }\nexport class Class_${i} {}`,
      );
    }

    const { RepositoryIndexer } = await import('@evolve/indexer');
    const indexer = new RepositoryIndexer(dbInstance.sqlite);
    const start = Date.now();
    const stats = await indexer.index(largeDir, 'proj_large');
    const duration = Date.now() - start;

    expect(stats.totalFiles).toBe(150);
    expect(stats.addedFiles).toBe(150);
    expect(stats.totalSymbols).toBe(300); // 150 functions + 150 classes
    expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
  });
});
