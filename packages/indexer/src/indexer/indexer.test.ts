import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDatabase, type EvolveDatabaseInstance } from '@evolve/db';
import { TypeScriptAstParser } from '../parsers/typescript.js';
import { GenericRegexParser } from '../parsers/generic.js';
import { RepositoryIndexer } from './incremental.js';

describe('Repository Indexer & AST Parsers', () => {
  let tempDir: string;
  let dbInstance: EvolveDatabaseInstance;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-indexer-test-'));
    dbInstance = initDatabase({ path: ':memory:' });

    // Seed a test project in db
    dbInstance.sqlite
      .prepare(
        'INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run('proj_test', 'Test Project', tempDir, Date.now(), Date.now());
  });

  afterEach(() => {
    dbInstance.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('extracts symbols and dependencies using TypeScript AST parser', () => {
    const parser = new TypeScriptAstParser();
    const code = `
      import { AuthService, verifyToken } from './auth.js';
      import express from 'express';

      export interface UserProfile {
        id: string;
        email: string;
      }

      export type UserId = string;

      export class UserManager {
        constructor(private auth: AuthService) {}

        public async getUser(id: UserId): Promise<UserProfile> {
          return { id, email: 'test@example.com' };
        }
      }

      export function validateUser(user: UserProfile): boolean {
        return Boolean(user.id);
      }

      export const helperArrow = (x: number) => x * 2;
    `;

    const result = parser.parse('src/user.ts', code);

    // Symbols
    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('UserProfile');
    expect(names).toContain('UserId');
    expect(names).toContain('UserManager');
    expect(names).toContain('UserManager.constructor');
    expect(names).toContain('UserManager.getUser');
    expect(names).toContain('validateUser');
    expect(names).toContain('helperArrow');

    // Kinds
    expect(result.symbols.find((s) => s.name === 'UserProfile')?.kind).toBe('interface');
    expect(result.symbols.find((s) => s.name === 'UserManager')?.kind).toBe('class');
    expect(result.symbols.find((s) => s.name === 'validateUser')?.kind).toBe('function');
    expect(result.symbols.find((s) => s.name === 'helperArrow')?.kind).toBe('function');

    // Dependencies
    expect(result.dependencies).toHaveLength(2);
    const authDep = result.dependencies.find((d) => d.targetModule === './auth.js');
    expect(authDep).toBeDefined();
    expect(authDep?.importedSymbols).toEqual(['AuthService', 'verifyToken']);
    expect(authDep?.isExternal).toBe(false);

    const expressDep = result.dependencies.find((d) => d.targetModule === 'express');
    expect(expressDep?.isExternal).toBe(true);

    // Exports
    const exportNames = result.exports.map((e) => e.name);
    expect(exportNames).toContain('UserProfile');
    expect(exportNames).toContain('UserManager');
    expect(exportNames).toContain('validateUser');
    expect(exportNames).toContain('helperArrow');
  });

  it('extracts symbols using GenericRegexParser for Python, Rust, and Go', () => {
    const parser = new GenericRegexParser();

    // Python
    const pyCode = `
from datetime import datetime
import os

class AuthService:
    def authenticate(self, username, password):
        return True

def create_token(user_id):
    return "token"
`;
    const pyResult = parser.parse('auth.py', pyCode);
    const pyNames = pyResult.symbols.map((s) => s.name);
    expect(pyNames).toContain('AuthService');
    expect(pyNames).toContain('authenticate');
    expect(pyNames).toContain('create_token');
    expect(pyResult.dependencies.some((d) => d.targetModule === 'datetime')).toBe(true);

    // Rust
    const rsCode = `
use axum::Router;

pub struct ServerConfig {
    pub port: u16,
}

pub fn start_server(cfg: ServerConfig) {
    println!("Starting");
}
`;
    const rsResult = parser.parse('server.rs', rsCode);
    const rsNames = rsResult.symbols.map((s) => s.name);
    expect(rsNames).toContain('ServerConfig');
    expect(rsNames).toContain('start_server');

    // Go
    const goCode = `
package main

import "fmt"

type Handler struct{}

func (h *Handler) ServeHTTP() {}

func StartServer() {}
`;
    const goResult = parser.parse('main.go', goCode);
    const goNames = goResult.symbols.map((s) => s.name);
    expect(goNames).toContain('Handler');
    expect(goNames).toContain('ServeHTTP');
    expect(goNames).toContain('StartServer');
  });

  it('performs incremental repository indexing, updates on edit, and prunes deletions', async () => {
    // 1. Setup workspace files
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    const file1Path = path.join(tempDir, 'src', 'auth.ts');
    fs.writeFileSync(
      file1Path,
      'export function login(username: string): boolean { return true; }',
    );

    const file2Path = path.join(tempDir, 'src', 'user.ts');
    fs.writeFileSync(
      file2Path,
      'import { login } from "./auth.js";\nexport class User { id = 1; }',
    );

    const indexer = new RepositoryIndexer(dbInstance.sqlite);

    // Initial indexing
    const initialStats = await indexer.index(tempDir, 'proj_test');
    expect(initialStats.totalFiles).toBe(2);
    expect(initialStats.addedFiles).toBe(2);
    expect(initialStats.modifiedFiles).toBe(0);
    expect(initialStats.unchangedFiles).toBe(0);
    expect(initialStats.deletedFiles).toBe(0);
    expect(initialStats.totalSymbols).toBeGreaterThanOrEqual(2);

    // Verify database rows
    const filesInDb = dbInstance.sqlite
      .prepare('SELECT path, language FROM repo_files WHERE project_id = ?')
      .all('proj_test') as Array<{ path: string; language: string }>;
    expect(filesInDb).toHaveLength(2);

    const symbolsInDb = dbInstance.sqlite
      .prepare('SELECT name, kind FROM repo_symbols WHERE project_id = ?')
      .all('proj_test') as Array<{ name: string; kind: string }>;
    const symNames = symbolsInDb.map((s) => s.name);
    expect(symNames).toContain('login');
    expect(symNames).toContain('User');

    // Verify FTS5 virtual table contains contents
    const ftsResults = dbInstance.sqlite
      .prepare('SELECT file_path FROM repo_code_fts WHERE repo_code_fts MATCH ?')
      .all('login') as Array<{ file_path: string }>;
    expect(ftsResults.length).toBeGreaterThanOrEqual(1);

    // 2. Incremental Run: Unchanged files should be skipped
    const secondStats = await indexer.index(tempDir, 'proj_test');
    expect(secondStats.addedFiles).toBe(0);
    expect(secondStats.modifiedFiles).toBe(0);
    expect(secondStats.unchangedFiles).toBe(2);
    expect(secondStats.deletedFiles).toBe(0);

    // 3. Edit one file: only that file should be re-indexed
    fs.appendFileSync(
      file1Path,
      '\nexport function logout(): void { console.log("bye"); }',
    );

    const thirdStats = await indexer.index(tempDir, 'proj_test');
    expect(thirdStats.modifiedFiles).toBe(1);
    expect(thirdStats.unchangedFiles).toBe(1);
    expect(thirdStats.addedFiles).toBe(0);

    // Verify new symbol exists
    const updatedSymbols = dbInstance.sqlite
      .prepare('SELECT name FROM repo_symbols WHERE project_id = ?')
      .all('proj_test') as Array<{ name: string }>;
    expect(updatedSymbols.map((s) => s.name)).toContain('logout');

    // 4. Delete one file: indexer should prune it from database and FTS
    fs.unlinkSync(file2Path);

    const fourthStats = await indexer.index(tempDir, 'proj_test');
    expect(fourthStats.totalFiles).toBe(1);
    expect(fourthStats.deletedFiles).toBe(1);
    expect(fourthStats.unchangedFiles).toBe(1);

    const remainingFiles = dbInstance.sqlite
      .prepare('SELECT path FROM repo_files WHERE project_id = ?')
      .all('proj_test') as Array<{ path: string }>;
    expect(remainingFiles).toHaveLength(1);
    expect(remainingFiles[0]?.path).toBe('src/auth.ts');
  });
});
