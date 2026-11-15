import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSessionId, noopLogger, type ToolExecutionContext } from '@evolve/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCommandTool, runTestsTool } from './execution.js';
import {
  editFileTool,
  listFilesTool,
  readFileTool,
  searchCodeTool,
  writeFileTool,
} from './filesystem.js';
import { execGit, gitDiffTool, gitStatusTool } from './git.js';
import { createDefaultToolRegistry } from './registry.js';
import { isSensitiveFile } from './security.js';

describe('Evolve Tool Execution Package', () => {
  let tmpDir: string;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-tools-test-'));
    mockContext = {
      sessionId: createSessionId(),
      workspaceRoot: tmpDir,
      logger: noopLogger,
    };
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('ToolRegistry', () => {
    it('creates default registry with all 9 tools registered', () => {
      const registry = createDefaultToolRegistry();
      expect(registry.list().length).toBe(9);
      expect(registry.has('read_file')).toBe(true);
      expect(registry.has('write_file')).toBe(true);
      expect(registry.has('edit_file')).toBe(true);
      expect(registry.has('list_files')).toBe(true);
      expect(registry.has('search_code')).toBe(true);
      expect(registry.has('run_command')).toBe(true);
      expect(registry.has('run_tests')).toBe(true);
      expect(registry.has('git_status')).toBe(true);
      expect(registry.has('git_diff')).toBe(true);

      const definitions = registry.toModelDefinitions();
      expect(definitions.length).toBe(9);
      for (const def of definitions) {
        expect(def.name).toBeDefined();
        expect(def.description).toBeDefined();
        expect(def.parameters).toBeDefined();
      }
    });
  });

  describe('Security & Sensitive File Filtering', () => {
    it('identifies sensitive credential files correctly', () => {
      expect(isSensitiveFile('.env')).toBe(true);
      expect(isSensitiveFile('.env.local')).toBe(true);
      expect(isSensitiveFile('.env.production')).toBe(true);
      expect(isSensitiveFile('.git/config')).toBe(true);
      expect(isSensitiveFile('.git/credentials')).toBe(true);
      expect(isSensitiveFile('id_rsa')).toBe(true);
      expect(isSensitiveFile('id_ed25519')).toBe(true);
      expect(isSensitiveFile('server.key')).toBe(true);
      expect(isSensitiveFile('cert.pem')).toBe(true);
      expect(isSensitiveFile('.npmrc')).toBe(true);
      expect(isSensitiveFile('credentials.json')).toBe(true);

      // Normal files should not be flagged
      expect(isSensitiveFile('index.ts')).toBe(false);
      expect(isSensitiveFile('package.json')).toBe(false);
      expect(isSensitiveFile('README.md')).toBe(false);
    });
  });

  describe('read_file tool', () => {
    it('reads a valid text file inside workspace', async () => {
      const filePath = path.join(tmpDir, 'hello.txt');
      fs.writeFileSync(filePath, 'Hello, Evolve!', 'utf-8');

      const res = await readFileTool.execute({ path: 'hello.txt' }, mockContext);
      expect(res.success).toBe(true);
      expect(res.output).toBe('Hello, Evolve!');
      expect(res.data?.bytesRead).toBe(14);
    });

    it('returns error when file does not exist', async () => {
      const res = await readFileTool.execute({ path: 'missing.txt' }, mockContext);
      expect(res.success).toBe(false);
      expect(res.output).toContain('File not found');
      expect(res.error).toBe('FILE_NOT_FOUND');
    });

    it('truncates content when exceeding maxBytes', async () => {
      const filePath = path.join(tmpDir, 'large.txt');
      fs.writeFileSync(filePath, 'A'.repeat(500), 'utf-8');

      const res = await readFileTool.execute({ path: 'large.txt', maxBytes: 100 }, mockContext);
      expect(res.success).toBe(true);
      expect(res.data?.truncated).toBe(true);
      expect(res.data?.bytesRead).toBe(100);
      expect(res.output).toContain('Warning: File truncated at 100 characters');
    });

    it('blocks path traversal attacks (e.g. ../../etc/passwd)', async () => {
      const res = await readFileTool.execute({ path: '../../../etc/passwd' }, mockContext);
      expect(res.success).toBe(false);
      expect(res.output).toContain('Path traversal attempt detected');
    });

    it('blocks access to sensitive .env files', async () => {
      const envFile = path.join(tmpDir, '.env');
      fs.writeFileSync(envFile, 'DATABASE_URL=secret_key', 'utf-8');

      const res = await readFileTool.execute({ path: '.env' }, mockContext);
      expect(res.success).toBe(false);
      expect(res.output).toContain('Access to sensitive file is blocked');
    });
  });

  describe('write_file tool', () => {
    it('creates a new file and any required parent directories', async () => {
      const res = await writeFileTool.execute(
        { path: 'nested/sub/created.txt', content: 'Nested content' },
        mockContext,
      );

      expect(res.success).toBe(true);
      expect(res.data?.overwritten).toBe(false);
      const fullPath = path.join(tmpDir, 'nested/sub/created.txt');
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(fs.readFileSync(fullPath, 'utf-8')).toBe('Nested content');
    });

    it('requires approval when approval handler is configured', async () => {
      let approvalRequested = false;
      const contextWithApproval: ToolExecutionContext = {
        ...mockContext,
        requestApproval: async (req) => {
          approvalRequested = true;
          expect(req.toolName).toBe('write_file');
          return false; // Deny approval
        },
      };

      const res = await writeFileTool.execute(
        { path: 'denied.txt', content: 'Will not be written' },
        contextWithApproval,
      );

      expect(approvalRequested).toBe(true);
      expect(res.success).toBe(false);
      expect(res.error).toBe('APPROVAL_DENIED');
      expect(fs.existsSync(path.join(tmpDir, 'denied.txt'))).toBe(false);
    });

    it('blocks writing to sensitive files', async () => {
      const res = await writeFileTool.execute(
        { path: '.env.local', content: 'SECRET=123' },
        mockContext,
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('Access to sensitive file is blocked');
      expect(fs.existsSync(path.join(tmpDir, '.env.local'))).toBe(false);
    });

    it('blocks path traversal write attacks', async () => {
      const res = await writeFileTool.execute(
        { path: '../../escaped.txt', content: 'pwned' },
        mockContext,
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('Path traversal attempt detected');
    });
  });

  describe('edit_file tool', () => {
    it('replaces exact target string in an existing file', async () => {
      const filePath = path.join(tmpDir, 'code.ts');
      fs.writeFileSync(filePath, 'const count: number = 10;\nconsole.log(count);', 'utf-8');

      const res = await editFileTool.execute(
        {
          path: 'code.ts',
          target: 'const count: number = 10;',
          replacement: 'const count: number = 20;',
        },
        mockContext,
      );

      expect(res.success).toBe(true);
      expect(res.data?.replacementsCount).toBe(1);
      expect(fs.readFileSync(filePath, 'utf-8')).toContain('const count: number = 20;');
    });

    it('returns error when target string is not found', async () => {
      const filePath = path.join(tmpDir, 'code.ts');
      fs.writeFileSync(filePath, 'const x = 1;', 'utf-8');

      const res = await editFileTool.execute(
        {
          path: 'code.ts',
          target: 'non_existent_target',
          replacement: 'new_value',
        },
        mockContext,
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('TARGET_NOT_FOUND');
    });

    it('requires approval for editing existing files', async () => {
      const filePath = path.join(tmpDir, 'important.ts');
      fs.writeFileSync(filePath, 'let safe = true;', 'utf-8');

      const contextWithDenial: ToolExecutionContext = {
        ...mockContext,
        requestApproval: async () => false,
      };

      const res = await editFileTool.execute(
        {
          path: 'important.ts',
          target: 'safe = true',
          replacement: 'safe = false',
        },
        contextWithDenial,
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('APPROVAL_DENIED');
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('let safe = true;');
    });
  });

  describe('list_files tool', () => {
    it('lists directory entries while skipping ignored patterns and sensitive files', async () => {
      fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'content1', 'utf-8');
      fs.writeFileSync(path.join(tmpDir, 'file2.ts'), 'content2', 'utf-8');
      fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET=abc', 'utf-8'); // sensitive
      fs.mkdirSync(path.join(tmpDir, 'node_modules')); // ignored dir
      fs.writeFileSync(path.join(tmpDir, 'node_modules/dummy.js'), 'dummy', 'utf-8');

      const res = await listFilesTool.execute({ path: '.' }, mockContext);
      expect(res.success).toBe(true);
      const paths = res.data?.items.map((it) => it.path) ?? [];
      expect(paths).toContain('file1.txt');
      expect(paths).toContain('file2.ts');
      expect(paths).not.toContain('.env');
      expect(paths).not.toContain('node_modules');
    });
  });

  describe('search_code tool', () => {
    it('finds literal text matches across files with line numbers', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'src1.ts'),
        'function hello() {\n  return "EvolveAgent";\n}',
        'utf-8',
      );
      fs.writeFileSync(path.join(tmpDir, 'src2.ts'), 'const name = "EvolveAgent";', 'utf-8');

      const res = await searchCodeTool.execute({ query: 'EvolveAgent' }, mockContext);
      expect(res.success).toBe(true);
      expect(res.data?.totalMatches).toBe(2);
      expect(res.output).toContain('src1.ts:2');
      expect(res.output).toContain('src2.ts:1');
    });

    it('supports regex queries when isRegex: true', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'data.ts'),
        'const port1 = 3000;\nconst port2 = 8080;',
        'utf-8',
      );

      const res = await searchCodeTool.execute(
        { query: 'port\\d\\s*=\\s*\\d+', isRegex: true },
        mockContext,
      );
      expect(res.success).toBe(true);
      expect(res.data?.totalMatches).toBe(2);
    });
  });

  describe('run_command tool', () => {
    it('executes a safe command and returns exitCode 0 and stdout', async () => {
      const res = await runCommandTool.execute(
        { command: 'echo "hello evolve command"' },
        mockContext,
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('hello evolve command');
      expect(res.data?.exitCode).toBe(0);
    });

    it('reports failure when command returns non-zero exit code', async () => {
      const res = await runCommandTool.execute({ command: 'exit 42' }, mockContext);

      expect(res.success).toBe(false);
      expect(res.data?.exitCode).toBe(42);
      expect(res.error).toContain('Exit code 42');
    });

    it('enforces execution timeout and terminates runaway processes', async () => {
      const res = await runCommandTool.execute({ command: 'sleep 5', timeoutMs: 200 }, mockContext);

      expect(res.success).toBe(false);
      expect(res.data?.timedOut).toBe(true);
      expect(res.output).toContain('timed out');
    });

    it('caps massive stdout output to maxOutputBytes', async () => {
      // Generate large output via loop
      const res = await runCommandTool.execute(
        { command: 'node -e "process.stdout.write(\'X\'.repeat(10000))"', maxOutputBytes: 500 },
        mockContext,
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('Warning: stdout truncated at 500 characters');
      expect(res.data?.stdout.length).toBeLessThan(1000);
    });

    it('requires approval for command execution when approval is enabled', async () => {
      const contextWithDenial: ToolExecutionContext = {
        ...mockContext,
        requestApproval: async () => false,
      };

      const res = await runCommandTool.execute(
        { command: 'echo "should be blocked"' },
        contextWithDenial,
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('APPROVAL_DENIED');
    });
  });

  describe('run_tests tool', () => {
    it('auto-detects package.json test script and executes', async () => {
      const pkgJson = {
        name: 'test-project',
        scripts: {
          test: 'echo "1 tests passed"',
        },
      };
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkgJson), 'utf-8');

      const res = await runTestsTool.execute({}, mockContext);
      expect(res.success).toBe(true);
      expect(res.data?.passed).toBe(true);
      expect(res.output).toContain('Tests PASSED');
    });
  });

  describe('git_status and git_diff tools', () => {
    it('inspects git repository status and shows diffs safely', async () => {
      // Initialize a real temporary git repo in tmpDir
      await execGit(tmpDir, ['init', '-b', 'main']);
      await execGit(tmpDir, ['config', 'user.name', 'Evolve Test']);
      await execGit(tmpDir, ['config', 'user.email', 'test@evolve.local']);

      // Initial commit
      fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'initial line\n', 'utf-8');
      await execGit(tmpDir, ['add', 'file.txt']);
      await execGit(tmpDir, ['commit', '-m', 'initial']);

      // 1. Status clean check
      let statusRes = await gitStatusTool.execute({}, mockContext);
      expect(statusRes.success).toBe(true);
      expect(statusRes.data?.clean).toBe(true);
      expect(statusRes.data?.branch).toBe('main');

      // 2. Modify file and add untracked file
      fs.appendFileSync(path.join(tmpDir, 'file.txt'), 'second line\n', 'utf-8');
      fs.writeFileSync(path.join(tmpDir, 'untracked.txt'), 'untracked', 'utf-8');

      statusRes = await gitStatusTool.execute({}, mockContext);
      expect(statusRes.success).toBe(true);
      expect(statusRes.data?.clean).toBe(false);
      expect(statusRes.data?.unstaged.length).toBeGreaterThan(0);
      expect(statusRes.data?.untracked).toContain('untracked.txt');

      // 3. Diff check
      const diffRes = await gitDiffTool.execute({}, mockContext);
      expect(diffRes.success).toBe(true);
      expect(diffRes.data?.filesChanged).toBe(1);
      expect(diffRes.output).toContain('+second line');

      // 4. Argument injection protection check: path starting with '--'
      const injectionRes = await gitDiffTool.execute({ path: '--upload-pack' }, mockContext);
      // '--' was safely passed as path operand, not as flag
      expect(injectionRes.success).toBe(true);
    });
  });
});
