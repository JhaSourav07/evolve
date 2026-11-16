import fs from 'node:fs';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';

export const DEFAULT_EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.turbo',
  '.output',
  'target', // Rust/Cargo / Maven
  'bin',
  'obj', // C#
  '.gradle',
  '.idea',
  '.vscode',
  '.evolve',
  'coverage',
  '.cache',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
  'env',
  'vendor', // Go / PHP
  'Pods', // iOS
  '.dart_tool', // Flutter / Dart
  '.pub-cache',
]);

export const BINARY_EXTENSIONS = new Set([
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  '.svgz',
  // Audio & Video
  '.mp3',
  '.wav',
  '.ogg',
  '.flac',
  '.mp4',
  '.mkv',
  '.webm',
  '.avi',
  '.mov',
  // Documents & Archives
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.bz2',
  '.xz',
  // Binaries & Executables
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.wasm',
  '.o',
  '.a',
  '.class',
  '.pyc',
  '.pyo',
  // Databases
  '.sqlite',
  '.sqlite3',
  '.db',
  // Fonts
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
]);

export const SENSITIVE_FILE_PATTERNS: RegExp[] = [
  /^\.env(\..+)?$/i,
  /^\.git\/config$/i,
  /^\.git\/credentials$/i,
  /^id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/i,
  /\.(pem|key|pfx|p12|pkcs12)$/i,
  /^\.(netrc|npmrc|pypirc)$/i,
  /^(credentials|secrets|service-account.*)\.json$/i,
];

export function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export function isSensitiveFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const basename = path.basename(normalized);

  for (const pattern of SENSITIVE_FILE_PATTERNS) {
    if (pattern.test(basename)) {
      return true;
    }
  }

  if (normalized.includes('.git/config') || normalized.includes('.git/credentials')) {
    return true;
  }

  return false;
}

export interface ExclusionFilter {
  isExcluded(relativePath: string, isDirectory?: boolean): boolean;
}

export function createExclusionFilter(rootDir: string): ExclusionFilter {
  const ig: Ignore = ignore();

  // Add default directory exclusions
  for (const dir of DEFAULT_EXCLUDED_DIRS) {
    ig.add(`${dir}/`);
    ig.add(dir);
  }

  // Load root .gitignore if present
  const gitignorePath = path.join(rootDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      ig.add(content);
    } catch {
      // Ignore read errors on .gitignore
    }
  }

  return {
    isExcluded(relativePath: string, isDirectory = false): boolean {
      const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
      if (!normalized || normalized === '.') {
        return false;
      }

      // 1. Check directory exclusion
      const segments = normalized.split('/');
      for (const segment of segments) {
        if (DEFAULT_EXCLUDED_DIRS.has(segment)) {
          return true;
        }
      }

      // 2. Check sensitive files
      if (isSensitiveFile(normalized)) {
        return true;
      }

      // 3. Check binary extensions for files
      if (!isDirectory && isBinaryFile(normalized)) {
        return true;
      }

      // 4. Check gitignore rules
      const testPath = isDirectory ? `${normalized}/` : normalized;
      return ig.ignores(testPath);
    },
  };
}
