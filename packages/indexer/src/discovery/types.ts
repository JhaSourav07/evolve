export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'c'
  | 'cpp'
  | 'csharp'
  | 'dart'
  | 'ruby'
  | 'php'
  | 'html'
  | 'css'
  | 'shell'
  | 'markdown'
  | 'json'
  | 'yaml'
  | 'toml'
  | 'sql'
  | 'unknown';

export interface LanguageStats {
  language: SupportedLanguage;
  fileCount: number;
  totalBytes: number;
  percentage: number;
}

export type PackageManagerName =
  | 'pnpm'
  | 'npm'
  | 'yarn'
  | 'bun'
  | 'pip'
  | 'poetry'
  | 'cargo'
  | 'go'
  | 'maven'
  | 'gradle'
  | 'pub'
  | 'unknown';

export interface FrameworkInfo {
  name: string;
  category: 'frontend' | 'backend' | 'fullstack' | 'testing' | 'database' | 'mobile' | 'build' | 'other';
  version?: string | undefined;
}

export interface ManifestInfo {
  path: string;
  type:
    | 'package.json'
    | 'Cargo.toml'
    | 'pyproject.toml'
    | 'go.mod'
    | 'pom.xml'
    | 'build.gradle'
    | 'pubspec.yaml'
    | 'requirements.txt'
    | 'other';
  name?: string | undefined;
  version?: string | undefined;
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string> | undefined;
}

export interface MonorepoInfo {
  isMonorepo: boolean;
  type?:
    | 'pnpm-workspace'
    | 'npm-workspace'
    | 'yarn-workspace'
    | 'cargo-workspace'
    | 'turborepo'
    | 'lerna'
    | 'go-workspace'
    | undefined;
  workspaces?: string[] | undefined;
}

export interface GitInfo {
  isGitRepo: boolean;
  branch?: string | undefined;
  isClean?: boolean | undefined;
}

export interface ProjectDiscoveryResult {
  rootPath: string;
  projectName: string;
  git: GitInfo;
  monorepo: MonorepoInfo;
  primaryLanguage: SupportedLanguage;
  languages: LanguageStats[];
  frameworks: FrameworkInfo[];
  packageManagers: PackageManagerName[];
  manifests: ManifestInfo[];
  sourceDirectories: string[];
  testDirectories: string[];
  configFiles: string[];
  docFiles: string[];
  totalFiles: number;
  totalSize: number;
}

export interface ScannerOptions {
  maxFiles?: number | undefined;
  maxDepth?: number | undefined;
  includeIgnored?: boolean | undefined;
}
