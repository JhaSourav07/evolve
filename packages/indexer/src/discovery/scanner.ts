import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createExclusionFilter } from './exclusions.js';
import { computeLanguageStats } from './languages.js';
import { detectFrameworks, detectMonorepo, detectPackageManagers } from './frameworks.js';
import type {
  GitInfo,
  ManifestInfo,
  ProjectDiscoveryResult,
  ScannerOptions,
} from './types.js';

const ROOT_INDICATORS = [
  '.git',
  'package.json',
  'pnpm-workspace.yaml',
  'Cargo.toml',
  'pyproject.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'pubspec.yaml',
];

const SOURCE_DIR_NAMES = new Set([
  'src',
  'app',
  'lib',
  'packages',
  'apps',
  'components',
  'cmd',
  'pkg',
  'internal',
  'core',
]);

const TEST_DIR_NAMES = new Set([
  'test',
  'tests',
  '__tests__',
  'spec',
  'specs',
  'testing',
  'e2e',
]);

export class ProjectScanner {
  /**
   * Discovers the canonical project root starting from a target directory.
   */
  public findProjectRoot(startDir: string): string {
    let current = path.resolve(startDir);
    const root = path.parse(current).root;

    while (current !== root) {
      for (const indicator of ROOT_INDICATORS) {
        if (fs.existsSync(path.join(current, indicator))) {
          return current;
        }
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }

    return path.resolve(startDir);
  }

  /**
   * Scans a repository and produces a complete discovery result.
   */
  public async scan(
    targetDir: string,
    options: ScannerOptions = {},
  ): Promise<ProjectDiscoveryResult> {
    const rootPath = this.findProjectRoot(targetDir);
    const maxFiles = options.maxFiles ?? 10_000;
    const maxDepth = options.maxDepth ?? 15;

    const filter = createExclusionFilter(rootPath);
    const git = this.detectGit(rootPath);

    const fileRecords: Array<{ path: string; size: number }> = [];
    const discoveredDirs = new Set<string>();

    const walk = (currentDir: string, depth: number) => {
      if (depth > maxDepth || fileRecords.length >= maxFiles) return;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (fileRecords.length >= maxFiles) break;

        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          if (!options.includeIgnored && filter.isExcluded(relPath, true)) {
            continue;
          }
          discoveredDirs.add(relPath);
          walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          if (!options.includeIgnored && filter.isExcluded(relPath, false)) {
            continue;
          }
          let size: number;
          try {
            size = fs.statSync(fullPath).size;
          } catch {
            size = 0;
          }
          fileRecords.push({ path: relPath, size });
        }
      }
    };

    walk(rootPath, 1);

    const allFilePaths = fileRecords.map((f) => f.path);
    const manifests = this.parseManifests(rootPath, allFilePaths);
    const monorepo = detectMonorepo(rootPath, manifests);
    const frameworks = detectFrameworks(manifests, allFilePaths);
    const packageManagers = detectPackageManagers(rootPath, allFilePaths);
    const { languages, primaryLanguage } = computeLanguageStats(fileRecords);

    // Identify important directories
    const sourceDirectories = this.identifySourceDirs(discoveredDirs);
    const testDirectories = this.identifyTestDirs(discoveredDirs);
    const configFiles = this.identifyConfigFiles(allFilePaths);
    const docFiles = this.identifyDocFiles(allFilePaths);

    // Deduce project name
    const projectName = this.deduceProjectName(rootPath, manifests);
    const totalSize = fileRecords.reduce((acc, f) => acc + f.size, 0);

    return {
      rootPath,
      projectName,
      git,
      monorepo,
      primaryLanguage,
      languages,
      frameworks,
      packageManagers,
      manifests,
      sourceDirectories,
      testDirectories,
      configFiles,
      docFiles,
      totalFiles: fileRecords.length,
      totalSize,
    };
  }

  private detectGit(rootDir: string): GitInfo {
    const gitDir = path.join(rootDir, '.git');
    if (!fs.existsSync(gitDir)) {
      return { isGitRepo: false };
    }

    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: rootDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();

      const statusOutput = execSync('git status --porcelain', {
        cwd: rootDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();

      return {
        isGitRepo: true,
        branch: branch || undefined,
        isClean: statusOutput.length === 0,
      };
    } catch {
      return { isGitRepo: true };
    }
  }

  private parseManifests(rootDir: string, filePaths: string[]): ManifestInfo[] {
    const manifests: ManifestInfo[] = [];

    for (const relPath of filePaths) {
      const basename = path.basename(relPath).toLowerCase();
      const fullPath = path.join(rootDir, relPath);

      if (basename === 'package.json') {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const json = JSON.parse(content) as {
            name?: string;
            version?: string;
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
          };
          manifests.push({
            path: relPath,
            type: 'package.json',
            name: json.name,
            version: json.version,
            dependencies: json.dependencies ?? {},
            devDependencies: json.devDependencies ?? {},
          });
        } catch {
          // Ignore invalid JSON
        }
      } else if (basename === 'cargo.toml') {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          manifests.push(this.parseCargoToml(relPath, content));
        } catch {
          // Ignore
        }
      } else if (basename === 'pyproject.toml') {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          manifests.push(this.parsePyprojectToml(relPath, content));
        } catch {
          // Ignore
        }
      } else if (basename === 'go.mod') {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          manifests.push(this.parseGoMod(relPath, content));
        } catch {
          // Ignore
        }
      } else if (basename === 'pubspec.yaml') {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          manifests.push(this.parsePubspecYaml(relPath, content));
        } catch {
          // Ignore
        }
      }
    }

    return manifests;
  }

  private parseCargoToml(relPath: string, content: string): ManifestInfo {
    let name: string | undefined;
    let version: string | undefined;
    const dependencies: Record<string, string> = {};

    const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);
    if (nameMatch && nameMatch[1]) name = nameMatch[1];

    const versionMatch = content.match(/version\s*=\s*["']([^"']+)["']/);
    if (versionMatch && versionMatch[1]) version = versionMatch[1];

    const depSectionMatch = content.match(/\[dependencies\]([\s\S]*?)(\n\[|$)/);
    if (depSectionMatch && depSectionMatch[1]) {
      const lines = depSectionMatch[1].split('\n');
      for (const line of lines) {
        const m = line.match(/^\s*([a-zA-Z0-9_-]+)\s*=/);
        if (m && m[1]) {
          dependencies[m[1]] = '*';
        }
      }
    }

    return {
      path: relPath,
      type: 'Cargo.toml',
      name,
      version,
      dependencies,
    };
  }

  private parsePyprojectToml(relPath: string, content: string): ManifestInfo {
    let name: string | undefined;
    const dependencies: Record<string, string> = {};

    const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);
    if (nameMatch && nameMatch[1]) name = nameMatch[1];

    const depMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (depMatch && depMatch[1]) {
      const items = depMatch[1].split(',');
      for (const item of items) {
        const cleaned = item.trim().replace(/["']/g, '');
        if (cleaned) {
          const depName = cleaned.split(/[><=~]/)[0]?.trim();
          if (depName) dependencies[depName] = cleaned;
        }
      }
    }

    return {
      path: relPath,
      type: 'pyproject.toml',
      name,
      dependencies,
    };
  }

  private parseGoMod(relPath: string, content: string): ManifestInfo {
    let name: string | undefined;
    const dependencies: Record<string, string> = {};

    const modMatch = content.match(/module\s+([^\s\n]+)/);
    if (modMatch && modMatch[1]) name = modMatch[1];

    const requireMatch = content.match(/require\s*\(([\s\S]*?)\)/);
    if (requireMatch && requireMatch[1]) {
      const lines = requireMatch[1].split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] && parts[1]) {
          dependencies[parts[0]] = parts[1];
        }
      }
    }

    return {
      path: relPath,
      type: 'go.mod',
      name,
      dependencies,
    };
  }

  private parsePubspecYaml(relPath: string, content: string): ManifestInfo {
    let name: string | undefined;
    const dependencies: Record<string, string> = {};

    const nameMatch = content.match(/^name:\s*([^\s\n]+)/m);
    if (nameMatch && nameMatch[1]) name = nameMatch[1];

    const depSectionMatch = content.match(/^dependencies:([\s\S]*?)(^\w|$)/m);
    if (depSectionMatch && depSectionMatch[1]) {
      const lines = depSectionMatch[1].split('\n');
      for (const line of lines) {
        const m = line.match(/^\s{2}([a-zA-Z0-9_-]+):/);
        if (m && m[1] && m[1] !== 'flutter') {
          dependencies[m[1]] = '*';
        }
      }
    }

    return {
      path: relPath,
      type: 'pubspec.yaml',
      name,
      dependencies,
    };
  }

  private identifySourceDirs(discoveredDirs: Set<string>): string[] {
    const matched: string[] = [];
    for (const d of discoveredDirs) {
      const basename = path.basename(d);
      if (SOURCE_DIR_NAMES.has(basename)) {
        matched.push(d.endsWith('/') ? d : `${d}/`);
      }
    }
    return matched.sort();
  }

  private identifyTestDirs(discoveredDirs: Set<string>): string[] {
    const matched: string[] = [];
    for (const d of discoveredDirs) {
      const basename = path.basename(d);
      if (TEST_DIR_NAMES.has(basename)) {
        matched.push(d.endsWith('/') ? d : `${d}/`);
      }
    }
    return matched.sort();
  }

  private identifyConfigFiles(filePaths: string[]): string[] {
    const configs: string[] = [];
    for (const p of filePaths) {
      const basename = path.basename(p);
      if (
        basename.startsWith('tsconfig') ||
        basename.startsWith('package.json') ||
        basename.startsWith('vite.config') ||
        basename.startsWith('next.config') ||
        basename.startsWith('eslint.config') ||
        basename.startsWith('vitest.config') ||
        basename.startsWith('pnpm-workspace') ||
        basename === 'Cargo.toml' ||
        basename === 'pyproject.toml' ||
        basename === 'go.mod' ||
        basename === 'pom.xml' ||
        basename === 'pubspec.yaml' ||
        basename === 'Dockerfile' ||
        basename === 'docker-compose.yml'
      ) {
        configs.push(p);
      }
    }
    return configs.sort();
  }

  private identifyDocFiles(filePaths: string[]): string[] {
    const docs: string[] = [];
    for (const p of filePaths) {
      const basename = path.basename(p).toUpperCase();
      if (
        basename.startsWith('README') ||
        basename.startsWith('CONTRIBUTING') ||
        basename.startsWith('CHANGELOG') ||
        basename.startsWith('ARCHITECTURE') ||
        p.startsWith('docs/')
      ) {
        docs.push(p);
      }
    }
    return docs.sort();
  }

  private deduceProjectName(rootDir: string, manifests: ManifestInfo[]): string {
    const rootPkg = manifests.find((m) => m.path === 'package.json');
    if (rootPkg?.name) return rootPkg.name;

    const rootCargo = manifests.find((m) => m.path === 'Cargo.toml');
    if (rootCargo?.name) return rootCargo.name;

    const rootPy = manifests.find((m) => m.path === 'pyproject.toml');
    if (rootPy?.name) return rootPy.name;

    const rootGo = manifests.find((m) => m.path === 'go.mod');
    if (rootGo?.name) return rootGo.name;

    return path.basename(rootDir);
  }
}
