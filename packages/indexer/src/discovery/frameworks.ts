import fs from 'node:fs';
import path from 'node:path';
import type { FrameworkInfo, ManifestInfo, MonorepoInfo, PackageManagerName } from './types.js';

interface FrameworkRule {
  name: string;
  category: FrameworkInfo['category'];
  packageMatches?: string[];
  fileMatches?: string[];
}

const FRAMEWORK_RULES: FrameworkRule[] = [
  // Frontend
  { name: 'Next.js', category: 'frontend', packageMatches: ['next'], fileMatches: ['next.config.js', 'next.config.ts', 'next.config.mjs'] },
  { name: 'React', category: 'frontend', packageMatches: ['react', 'react-dom'] },
  { name: 'Vue.js', category: 'frontend', packageMatches: ['vue', 'nuxt'] },
  { name: 'Svelte', category: 'frontend', packageMatches: ['svelte', '@sveltejs/kit'] },
  { name: 'Angular', category: 'frontend', packageMatches: ['@angular/core'] },
  { name: 'Tailwind CSS', category: 'frontend', packageMatches: ['tailwindcss'], fileMatches: ['tailwind.config.js', 'tailwind.config.ts'] },

  // Backend Node.js
  { name: 'Express', category: 'backend', packageMatches: ['express'] },
  { name: 'Fastify', category: 'backend', packageMatches: ['fastify'] },
  { name: 'NestJS', category: 'backend', packageMatches: ['@nestjs/core'] },
  { name: 'Hono', category: 'backend', packageMatches: ['hono'] },
  { name: 'Node.js', category: 'backend', packageMatches: ['@types/node'] },

  // Python Frameworks
  { name: 'FastAPI', category: 'backend', packageMatches: ['fastapi'] },
  { name: 'Django', category: 'fullstack', packageMatches: ['django'], fileMatches: ['manage.py'] },
  { name: 'Flask', category: 'backend', packageMatches: ['flask'] },
  { name: 'PyTorch', category: 'other', packageMatches: ['torch', 'pytorch'] },
  { name: 'Pandas', category: 'other', packageMatches: ['pandas'] },

  // Rust Frameworks
  { name: 'Axum', category: 'backend', packageMatches: ['axum'] },
  { name: 'Actix-web', category: 'backend', packageMatches: ['actix-web'] },
  { name: 'Tokio', category: 'backend', packageMatches: ['tokio'] },

  // Go Frameworks
  { name: 'Gin', category: 'backend', packageMatches: ['github.com/gin-gonic/gin'] },
  { name: 'Echo', category: 'backend', packageMatches: ['github.com/labstack/echo'] },
  { name: 'Chi', category: 'backend', packageMatches: ['github.com/go-chi/chi'] },

  // Mobile
  { name: 'Flutter', category: 'mobile', fileMatches: ['pubspec.yaml'] },
  { name: 'React Native', category: 'mobile', packageMatches: ['react-native', 'expo'] },

  // Databases & ORMs
  { name: 'Prisma', category: 'database', packageMatches: ['@prisma/client', 'prisma'], fileMatches: ['prisma/schema.prisma'] },
  { name: 'Drizzle ORM', category: 'database', packageMatches: ['drizzle-orm'] },
  { name: 'SQLite', category: 'database', packageMatches: ['better-sqlite3', 'sqlite3', 'rusqlite'] },
  { name: 'PostgreSQL', category: 'database', packageMatches: ['pg', 'postgres', 'sqlx-postgres'] },
  { name: 'MongoDB', category: 'database', packageMatches: ['mongoose', 'mongodb', 'pymongo'] },
  { name: 'MySQL', category: 'database', packageMatches: ['mysql2', 'mysql'] },
  { name: 'SQLAlchemy', category: 'database', packageMatches: ['sqlalchemy'] },

  // Testing
  { name: 'Vitest', category: 'testing', packageMatches: ['vitest'] },
  { name: 'Jest', category: 'testing', packageMatches: ['jest'] },
  { name: 'Playwright', category: 'testing', packageMatches: ['@playwright/test'] },
  { name: 'Pytest', category: 'testing', packageMatches: ['pytest'] },
];

export function detectFrameworks(
  manifests: ManifestInfo[],
  allFilePaths: string[],
): FrameworkInfo[] {
  const detected = new Map<string, FrameworkInfo>();
  const allDeps = new Set<string>();

  for (const m of manifests) {
    for (const dep of Object.keys(m.dependencies)) {
      allDeps.add(dep.toLowerCase());
    }
    if (m.devDependencies) {
      for (const dep of Object.keys(m.devDependencies)) {
        allDeps.add(dep.toLowerCase());
      }
    }
  }

  const fileSet = new Set(allFilePaths.map((f) => path.basename(f).toLowerCase()));

  for (const rule of FRAMEWORK_RULES) {
    let matched = false;

    if (rule.packageMatches) {
      for (const pkg of rule.packageMatches) {
        if (allDeps.has(pkg.toLowerCase())) {
          matched = true;
          break;
        }
      }
    }

    if (!matched && rule.fileMatches) {
      for (const file of rule.fileMatches) {
        if (fileSet.has(file.toLowerCase()) || allFilePaths.some((p) => p.endsWith(file))) {
          matched = true;
          break;
        }
      }
    }

    if (matched && !detected.has(rule.name)) {
      detected.set(rule.name, {
        name: rule.name,
        category: rule.category,
      });
    }
  }

  return Array.from(detected.values());
}

export function detectPackageManagers(
  rootDir: string,
  allFilePaths: string[],
): PackageManagerName[] {
  const managers = new Set<PackageManagerName>();
  const fileBasenames = new Set(allFilePaths.map((f) => path.basename(f).toLowerCase()));

  if (fileBasenames.has('pnpm-lock.yaml') || fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) {
    managers.add('pnpm');
  }
  if (fileBasenames.has('package-lock.json') || fs.existsSync(path.join(rootDir, 'package-lock.json'))) {
    managers.add('npm');
  }
  if (fileBasenames.has('yarn.lock') || fs.existsSync(path.join(rootDir, 'yarn.lock'))) {
    managers.add('yarn');
  }
  if (fileBasenames.has('bun.lockb') || fileBasenames.has('bun.lock')) {
    managers.add('bun');
  }
  if (fileBasenames.has('cargo.lock') || fileBasenames.has('cargo.toml')) {
    managers.add('cargo');
  }
  if (fileBasenames.has('go.mod') || fileBasenames.has('go.sum')) {
    managers.add('go');
  }
  if (fileBasenames.has('poetry.lock')) {
    managers.add('poetry');
  }
  if (fileBasenames.has('requirements.txt') || fileBasenames.has('pipfile')) {
    managers.add('pip');
  }
  if (fileBasenames.has('pom.xml')) {
    managers.add('maven');
  }
  if (fileBasenames.has('build.gradle') || fileBasenames.has('build.gradle.kts')) {
    managers.add('gradle');
  }
  if (fileBasenames.has('pubspec.yaml')) {
    managers.add('pub');
  }

  return Array.from(managers);
}

export function detectMonorepo(rootDir: string, manifests: ManifestInfo[]): MonorepoInfo {
  // Check pnpm-workspace.yaml
  const pnpmWorkspace = path.join(rootDir, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmWorkspace)) {
    try {
      const content = fs.readFileSync(pnpmWorkspace, 'utf-8');
      const lines = content.split('\n');
      const workspaces: string[] = [];
      for (const line of lines) {
        const match = line.match(/^\s*-\s*['"]?([^'"]+)['"]?/);
        if (match && match[1]) {
          workspaces.push(match[1]);
        }
      }
      return {
        isMonorepo: true,
        type: 'pnpm-workspace',
        workspaces: workspaces.length > 0 ? workspaces : ['packages/*', 'apps/*'],
      };
    } catch {
      return { isMonorepo: true, type: 'pnpm-workspace' };
    }
  }

  // Check root package.json for workspaces
  const rootPkg = manifests.find((m) => m.path === 'package.json');
  if (rootPkg) {
    try {
      const fullPath = path.join(rootDir, 'package.json');
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as {
        workspaces?: string[] | { packages?: string[] };
      };
      if (parsed.workspaces) {
        const workspaces = Array.isArray(parsed.workspaces)
          ? parsed.workspaces
          : parsed.workspaces.packages ?? [];
        return {
          isMonorepo: true,
          type: 'npm-workspace',
          workspaces,
        };
      }
    } catch {
      // Ignore parse error
    }
  }

  // Check Cargo.toml for workspace
  const cargoPath = path.join(rootDir, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    try {
      const content = fs.readFileSync(cargoPath, 'utf-8');
      if (content.includes('[workspace]')) {
        return {
          isMonorepo: true,
          type: 'cargo-workspace',
        };
      }
    } catch {
      // Ignore
    }
  }

  // Check go.work
  const goWork = path.join(rootDir, 'go.work');
  if (fs.existsSync(goWork)) {
    return {
      isMonorepo: true,
      type: 'go-workspace',
    };
  }

  return { isMonorepo: false };
}
