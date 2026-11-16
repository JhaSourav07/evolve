import path from 'node:path';
import type { LanguageStats, SupportedLanguage } from './types.js';

const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  // TypeScript & JavaScript
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',

  // Python
  '.py': 'python',
  '.pyi': 'python',

  // Rust
  '.rs': 'rust',

  // Go
  '.go': 'go',

  // Java
  '.java': 'java',

  // C / C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',

  // C#
  '.cs': 'csharp',

  // Dart
  '.dart': 'dart',

  // Ruby & PHP
  '.rb': 'ruby',
  '.php': 'php',

  // Web
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'css',
  '.less': 'css',

  // Shell
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',

  // Data & Docs
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.sql': 'sql',
};

export const PROGRAMMING_LANGUAGES = new Set<SupportedLanguage>([
  'typescript',
  'javascript',
  'python',
  'rust',
  'go',
  'java',
  'c',
  'cpp',
  'csharp',
  'dart',
  'ruby',
  'php',
]);

export function detectLanguageByExtension(filePath: string): SupportedLanguage {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? 'unknown';
}

export function computeLanguageStats(
  fileRecords: Array<{ path: string; size: number }>,
): { languages: LanguageStats[]; primaryLanguage: SupportedLanguage } {
  const counts = new Map<SupportedLanguage, { count: number; bytes: number }>();
  let totalBytes = 0;

  for (const file of fileRecords) {
    const lang = detectLanguageByExtension(file.path);
    if (lang === 'unknown') continue;

    const curr = counts.get(lang) ?? { count: 0, bytes: 0 };
    curr.count += 1;
    curr.bytes += file.size;
    counts.set(lang, curr);
    totalBytes += file.size;
  }

  const result: LanguageStats[] = [];
  for (const [lang, stat] of counts.entries()) {
    const percentage = totalBytes > 0 ? Number(((stat.bytes / totalBytes) * 100).toFixed(1)) : 0;
    result.push({
      language: lang,
      fileCount: stat.count,
      totalBytes: stat.bytes,
      percentage,
    });
  }

  // Sort by bytes descending
  result.sort((a, b) => b.totalBytes - a.totalBytes);

  // Prioritize primary code programming language over data/markup/config
  const primaryCode = result.find((l) => PROGRAMMING_LANGUAGES.has(l.language));
  const primaryLanguage = primaryCode?.language ?? result[0]?.language ?? 'unknown';

  return {
    languages: result,
    primaryLanguage,
  };
}
