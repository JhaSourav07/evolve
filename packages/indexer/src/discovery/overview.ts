import type { ProjectDiscoveryResult } from './types.js';

export function formatProjectOverview(result: ProjectDiscoveryResult): string {
  const sections: string[] = [];

  // Project Header
  sections.push(`Project: ${result.projectName}`);

  // Monorepo status
  if (result.monorepo.isMonorepo) {
    const ws = result.monorepo.workspaces?.join(', ') ?? 'configured workspaces';
    sections.push(`Monorepo: ${result.monorepo.type ?? 'workspaces'} (${ws})`);
  }

  // Git status
  if (result.git.isGitRepo) {
    sections.push(
      `Git: ${result.git.branch ?? 'unknown branch'} (${result.git.isClean ? 'clean' : 'modified'})`,
    );
  }

  // Group Frameworks by category
  const frontend = result.frameworks.filter(
    (f) => f.category === 'frontend' || f.category === 'fullstack',
  );
  const backend = result.frameworks.filter(
    (f) => f.category === 'backend' || f.category === 'fullstack',
  );
  const database = result.frameworks.filter((f) => f.category === 'database');
  const testing = result.frameworks.filter((f) => f.category === 'testing');
  const mobile = result.frameworks.filter((f) => f.category === 'mobile');

  // Primary languages to add to frontend/backend if relevant
  const langNames = result.languages.map((l) => capitalize(l.language));

  if (frontend.length > 0 || langNames.includes('Typescript') || langNames.includes('Javascript')) {
    const items = new Set<string>();
    for (const f of frontend) items.add(f.name);
    if (result.languages.some((l) => l.language === 'typescript')) items.add('TypeScript');
    else if (result.languages.some((l) => l.language === 'javascript')) items.add('JavaScript');

    if (items.size > 0) {
      sections.push('');
      sections.push('Frontend:');
      for (const item of items) {
        sections.push(`  - ${item}`);
      }
    }
  }

  if (
    backend.length > 0 ||
    result.languages.some((l) => ['python', 'rust', 'go', 'java', 'csharp'].includes(l.language))
  ) {
    const items = new Set<string>();
    for (const b of backend) items.add(b.name);
    for (const l of result.languages) {
      if (['python', 'rust', 'go', 'java', 'csharp'].includes(l.language)) {
        items.add(capitalize(l.language));
      }
    }
    if (items.size > 0) {
      sections.push('');
      sections.push('Backend:');
      for (const item of items) {
        sections.push(`  - ${item}`);
      }
    }
  }

  if (database.length > 0) {
    sections.push('');
    sections.push('Database:');
    for (const db of database) {
      sections.push(`  - ${db.name}`);
    }
  }

  if (mobile.length > 0) {
    sections.push('');
    sections.push('Mobile:');
    for (const m of mobile) {
      sections.push(`  - ${m.name}`);
    }
  }

  if (testing.length > 0) {
    sections.push('');
    sections.push('Testing:');
    for (const t of testing) {
      sections.push(`  - ${t.name}`);
    }
  }

  // Important directories
  const importantDirs = Array.from(
    new Set([...result.sourceDirectories, ...result.testDirectories]),
  );
  if (importantDirs.length > 0) {
    sections.push('');
    sections.push('Important directories:');
    for (const dir of importantDirs.slice(0, 12)) {
      sections.push(`  - ${dir}`);
    }
  }

  // Configuration
  if (result.configFiles.length > 0) {
    sections.push('');
    sections.push('Configuration:');
    for (const cfg of result.configFiles.slice(0, 10)) {
      sections.push(`  - ${cfg}`);
    }
  }

  return sections.join('\n');
}

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
