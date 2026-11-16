import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectScanner } from './scanner.js';
import { createExclusionFilter } from './exclusions.js';
import { formatProjectOverview } from './overview.js';

describe('Repository Discovery & Scanner', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-discovery-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects project root from nested directories', () => {
    const scanner = new ProjectScanner();
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'root-proj' }));
    const nestedSub = path.join(tempDir, 'packages', 'core', 'src');
    fs.mkdirSync(nestedSub, { recursive: true });

    const detected = scanner.findProjectRoot(nestedSub);
    expect(detected).toBe(tempDir);
  });

  it('respects .gitignore, default exclusions, sensitive files, and binaries', () => {
    // 1. Setup sample repo files
    fs.writeFileSync(path.join(tempDir, '.gitignore'), 'ignored-custom/\n*.secret\n');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-app' }));

    // Safe source files
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export const hello = 1;');

    // Ignored by .gitignore
    fs.mkdirSync(path.join(tempDir, 'ignored-custom'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'ignored-custom', 'temp.txt'), 'do not index');
    fs.writeFileSync(path.join(tempDir, 'my.secret'), 'confidential');

    // Default excluded directory
    fs.mkdirSync(path.join(tempDir, 'node_modules', 'foo'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'foo', 'index.js'), 'export {}');

    // Sensitive credential files
    fs.writeFileSync(path.join(tempDir, '.env'), 'SECRET_KEY=123');
    fs.writeFileSync(path.join(tempDir, '.env.local'), 'SECRET_KEY=local');
    fs.writeFileSync(path.join(tempDir, 'id_rsa'), 'ssh-rsa AAAAB3');
    fs.writeFileSync(path.join(tempDir, 'credentials.json'), '{"key":"secret"}');

    // Binary file
    fs.writeFileSync(path.join(tempDir, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const filter = createExclusionFilter(tempDir);
    expect(filter.isExcluded('src/index.ts')).toBe(false);
    expect(filter.isExcluded('ignored-custom/temp.txt')).toBe(true);
    expect(filter.isExcluded('my.secret')).toBe(true);
    expect(filter.isExcluded('node_modules/foo/index.js')).toBe(true);
    expect(filter.isExcluded('.env')).toBe(true);
    expect(filter.isExcluded('.env.local')).toBe(true);
    expect(filter.isExcluded('id_rsa')).toBe(true);
    expect(filter.isExcluded('credentials.json')).toBe(true);
    expect(filter.isExcluded('image.png')).toBe(true);
  });

  it('scans multi-ecosystem project and identifies languages and frameworks', async () => {
    // Setup simulated Next.js + React + Node.js + MongoDB repository
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'my-app',
        dependencies: {
          next: '^14.0.0',
          react: '^18.2.0',
          express: '^4.18.2',
          mongodb: '^6.0.0',
        },
        devDependencies: {
          typescript: '^5.3.0',
          vitest: '^1.0.0',
        },
      }),
    );
    fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'next.config.ts'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4');

    fs.mkdirSync(path.join(tempDir, 'src', 'components'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'console.log("hello");');
    fs.writeFileSync(
      path.join(tempDir, 'src', 'components', 'Button.tsx'),
      'export const Button = () => null;',
    );

    fs.mkdirSync(path.join(tempDir, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'tests', 'app.test.ts'), 'test("ok", () => {});');

    const scanner = new ProjectScanner();
    const result = await scanner.scan(tempDir);

    expect(result.projectName).toBe('my-app');
    expect(result.primaryLanguage).toBe('typescript');
    expect(result.packageManagers).toContain('pnpm');

    const frameworkNames = result.frameworks.map((f) => f.name);
    expect(frameworkNames).toContain('Next.js');
    expect(frameworkNames).toContain('React');
    expect(frameworkNames).toContain('Express');
    expect(frameworkNames).toContain('MongoDB');
    expect(frameworkNames).toContain('Vitest');

    expect(result.sourceDirectories).toContain('src/');
    expect(result.testDirectories).toContain('tests/');
    expect(result.configFiles).toContain('package.json');
    expect(result.configFiles).toContain('tsconfig.json');
    expect(result.configFiles).toContain('next.config.ts');

    const overview = formatProjectOverview(result);
    expect(overview).toContain('Project: my-app');
    expect(overview).toContain('Frontend:');
    expect(overview).toContain('- Next.js');
    expect(overview).toContain('- React');
    expect(overview).toContain('- TypeScript');
    expect(overview).toContain('Backend:');
    expect(overview).toContain('- Express');
    expect(overview).toContain('Database:');
    expect(overview).toContain('- MongoDB');
    expect(overview).toContain('Important directories:');
    expect(overview).toContain('- src/');
    expect(overview).toContain('- tests/');
    expect(overview).toContain('Configuration:');
    expect(overview).toContain('- package.json');
    expect(overview).toContain('- tsconfig.json');
    expect(overview).toContain('- next.config.ts');
  });

  it('scans Python, Rust, and Go project ecosystems', async () => {
    // 1. Python ecosystem
    const pyDir = path.join(tempDir, 'py-proj');
    fs.mkdirSync(pyDir, { recursive: true });
    fs.writeFileSync(
      path.join(pyDir, 'pyproject.toml'),
      `[project]\nname = "ml-service"\ndependencies = ["fastapi>=0.100", "torch>=2.0", "pytest"]\n`,
    );
    fs.mkdirSync(path.join(pyDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(pyDir, 'src', 'main.py'), 'import fastapi\napp = fastapi.FastAPI()');

    const scanner = new ProjectScanner();
    const pyResult = await scanner.scan(pyDir);
    expect(pyResult.projectName).toBe('ml-service');
    expect(pyResult.primaryLanguage).toBe('python');
    expect(pyResult.frameworks.map((f) => f.name)).toContain('FastAPI');
    expect(pyResult.frameworks.map((f) => f.name)).toContain('PyTorch');

    // 2. Rust ecosystem
    const rustDir = path.join(tempDir, 'rust-proj');
    fs.mkdirSync(rustDir, { recursive: true });
    fs.writeFileSync(
      path.join(rustDir, 'Cargo.toml'),
      `[package]\nname = "my-service"\nversion = "0.1.0"\n[dependencies]\naxum = "0.7"\ntokio = "1.0"\n`,
    );
    fs.writeFileSync(path.join(rustDir, 'Cargo.lock'), '');
    fs.mkdirSync(path.join(rustDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(rustDir, 'src', 'main.rs'), 'fn main() {}');

    const rustResult = await scanner.scan(rustDir);
    expect(rustResult.projectName).toBe('my-service');
    expect(rustResult.primaryLanguage).toBe('rust');
    expect(rustResult.packageManagers).toContain('cargo');
    expect(rustResult.frameworks.map((f) => f.name)).toContain('Axum');
    expect(rustResult.frameworks.map((f) => f.name)).toContain('Tokio');

    // 3. Go ecosystem
    const goDir = path.join(tempDir, 'go-proj');
    fs.mkdirSync(goDir, { recursive: true });
    fs.writeFileSync(
      path.join(goDir, 'go.mod'),
      `module github.com/user/go-api\n\ngo 1.22\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n)\n`,
    );
    fs.mkdirSync(path.join(goDir, 'cmd'), { recursive: true });
    fs.writeFileSync(path.join(goDir, 'cmd', 'main.go'), 'package main\nfunc main() {}');

    const goResult = await scanner.scan(goDir);
    expect(goResult.projectName).toBe('github.com/user/go-api');
    expect(goResult.primaryLanguage).toBe('go');
    expect(goResult.packageManagers).toContain('go');
    expect(goResult.frameworks.map((f) => f.name)).toContain('Gin');
  });

  it('scans the current Evolve workspace accurately', async () => {
    const scanner = new ProjectScanner();
    const result = await scanner.scan(process.cwd());

    expect(result.projectName).toBe('evolve-monorepo');
    expect(result.monorepo.isMonorepo).toBe(true);
    expect(result.monorepo.type).toBe('pnpm-workspace');
    expect(result.git.isGitRepo).toBe(true);
    expect(result.primaryLanguage).toBe('typescript');
    expect(result.packageManagers).toContain('pnpm');
    expect(result.frameworks.map((f) => f.name)).toContain('Vitest');
    expect(result.frameworks.map((f) => f.name)).toContain('SQLite');

    const overview = formatProjectOverview(result);
    expect(overview).toContain('Project: evolve-monorepo');
    expect(overview).toContain('Monorepo:');
    expect(overview).toContain('Important directories:');
  });
});
