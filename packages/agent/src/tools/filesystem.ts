import fs from 'node:fs';
import path from 'node:path';
import type { AgentTool } from '@evolve/core';
import { createExclusionFilter } from '@evolve/indexer';
import { z } from 'zod';
import { assertSafePath, checkApproval } from './security.js';

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.exe',
  '.wasm',
  '.bin',
  '.sqlite',
  '.db',
]);

export const readFileTool: AgentTool<
  {
    path: string;
    maxBytes?: number | undefined;
    startLine?: number | undefined;
    endLine?: number | undefined;
  },
  { path: string; bytesRead: number; content: string; truncated: boolean }
> = {
  definition: {
    name: 'read_file',
    description:
      'Reads the text content of a file within the workspace root. Supports optional line-range slicing.',
    parameters: z.object({
      path: z.string().min(1).describe('Relative path to the file to read'),
      maxBytes: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum bytes to read (default 500KB)'),
      startLine: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Optional starting line number (1-based, inclusive)'),
      endLine: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Optional ending line number (1-based, inclusive)'),
    }),
  },
  async execute({ path: targetPath, maxBytes = 512_000, startLine, endLine }, context) {
    try {
      const safePath = assertSafePath(targetPath, context.workspaceRoot);

      if (!fs.existsSync(safePath)) {
        return {
          success: false,
          output: `File not found: ${targetPath}`,
          error: 'FILE_NOT_FOUND',
        };
      }

      const stat = fs.statSync(safePath);
      if (stat.isDirectory()) {
        return {
          success: false,
          output: `Path is a directory, not a file: ${targetPath}`,
          error: 'IS_DIRECTORY',
        };
      }

      const ext = path.extname(safePath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        return {
          success: false,
          output: `Cannot read binary file '${targetPath}' (${stat.size} bytes).`,
          error: 'BINARY_FILE',
        };
      }

      const raw = fs.readFileSync(safePath, 'utf-8');

      // Line slicing support
      if (startLine !== undefined || endLine !== undefined) {
        const lines = raw.split('\n');
        const start = Math.max(1, startLine ?? 1);
        const end = Math.min(lines.length, endLine ?? lines.length);
        const selected = lines.slice(start - 1, end);
        const formatted = selected.map((l, idx) => `${start + idx}: ${l}`).join('\n');
        return {
          success: true,
          output: formatted,
          data: {
            path: targetPath,
            bytesRead: formatted.length,
            content: formatted,
            truncated: false,
          },
        };
      }

      const truncated = raw.length > maxBytes;
      const content = truncated ? raw.slice(0, maxBytes) : raw;
      const output = truncated
        ? `${content}\n\n[Warning: File truncated at ${maxBytes} characters. Original length: ${raw.length}]`
        : content;

      return {
        success: true,
        output,
        data: {
          path: targetPath,
          bytesRead: content.length,
          content,
          truncated,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to read file '${targetPath}': ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};

export const writeFileTool: AgentTool<
  { path: string; content: string },
  { path: string; bytesWritten: number; overwritten: boolean }
> = {
  definition: {
    name: 'write_file',
    description:
      'Creates or overwrites a file inside the workspace root. Requires approval for destructive overwrite.',
    parameters: z.object({
      path: z.string().min(1).describe('Relative path to the file to write'),
      content: z.string().describe('File content to write'),
    }),
  },
  async execute({ path: targetPath, content }, context) {
    try {
      const safePath = assertSafePath(targetPath, context.workspaceRoot);
      const exists = fs.existsSync(safePath);

      // Require approval for overwriting or creating file
      const approval = await checkApproval(
        'write_file',
        exists ? `Overwrite existing file '${targetPath}'` : `Create new file '${targetPath}'`,
        { path: targetPath, contentLength: content.length, exists },
        context,
      );

      if (!approval.approved) {
        return {
          success: false,
          output: approval.reason ?? `Write operation to '${targetPath}' was rejected.`,
          error: 'APPROVAL_DENIED',
        };
      }

      const parentDir = path.dirname(safePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(safePath, content, 'utf-8');

      return {
        success: true,
        output: `Successfully wrote ${content.length} characters to '${targetPath}' (${exists ? 'overwritten' : 'created'}).`,
        data: {
          path: targetPath,
          bytesWritten: content.length,
          overwritten: exists,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to write file '${targetPath}': ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};

export const editFileTool: AgentTool<
  { path: string; target: string; replacement: string },
  { path: string; replacementsCount: number }
> = {
  definition: {
    name: 'edit_file',
    description:
      'Performs exact string find-and-replace on an existing file. Requires approval for file modification.',
    parameters: z.object({
      path: z.string().min(1).describe('Relative path to the file to edit'),
      target: z.string().min(1).describe('Exact string to be replaced'),
      replacement: z.string().describe('Replacement text'),
    }),
  },
  async execute({ path: targetPath, target, replacement }, context) {
    try {
      const safePath = assertSafePath(targetPath, context.workspaceRoot);

      if (!fs.existsSync(safePath)) {
        return {
          success: false,
          output: `Cannot edit missing file: '${targetPath}'`,
          error: 'FILE_NOT_FOUND',
        };
      }

      const approval = await checkApproval(
        'edit_file',
        `Modify existing file '${targetPath}'`,
        { path: targetPath, target, replacement },
        context,
      );

      if (!approval.approved) {
        return {
          success: false,
          output: approval.reason ?? `Edit operation on '${targetPath}' was rejected.`,
          error: 'APPROVAL_DENIED',
        };
      }

      const currentContent = fs.readFileSync(safePath, 'utf-8');
      if (!currentContent.includes(target)) {
        return {
          success: false,
          output: `Target string not found in '${targetPath}'. Verify target whitespace and content.`,
          error: 'TARGET_NOT_FOUND',
        };
      }

      const count = currentContent.split(target).length - 1;
      const updated = currentContent.replaceAll(target, replacement);

      fs.writeFileSync(safePath, updated, 'utf-8');

      return {
        success: true,
        output: `Successfully replaced ${count} occurrence(s) in '${targetPath}'.`,
        data: {
          path: targetPath,
          replacementsCount: count,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to edit file '${targetPath}': ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};

export const listFilesTool: AgentTool<
  {
    path?: string | undefined;
    recursive?: boolean | undefined;
    maxDepth?: number | undefined;
    limit?: number | undefined;
  },
  { items: Array<{ path: string; isDirectory: boolean; size: number }>; totalCount: number }
> = {
  definition: {
    name: 'list_files',
    description: 'Lists files and directories in a workspace folder with size and type metadata.',
    parameters: z.object({
      path: z
        .string()
        .optional()
        .describe('Relative directory path to list (defaults to workspace root)'),
      recursive: z.boolean().optional().describe('Whether to list recursively (default false)'),
      maxDepth: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum recursion depth (default 3)'),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum items to return (default 100)'),
    }),
  },
  async execute({ path: subPath = '.', recursive = false, maxDepth = 3, limit = 100 }, context) {
    try {
      const safeDir = assertSafePath(subPath, context.workspaceRoot);

      if (!fs.existsSync(safeDir)) {
        return {
          success: false,
          output: `Directory not found: ${subPath}`,
          error: 'DIRECTORY_NOT_FOUND',
        };
      }

      const items: Array<{ path: string; isDirectory: boolean; size: number }> = [];
      const filter = createExclusionFilter(context.workspaceRoot);

      function walk(currentDir: string, depth: number) {
        if (items.length >= limit || depth > maxDepth) {
          return;
        }

        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (items.length >= limit) break;

          const name = entry.name;
          const fullPath = path.join(currentDir, name);
          const relPath = path.relative(context.workspaceRoot, fullPath).replace(/\\/g, '/');
          const isDir = entry.isDirectory();

          if (filter.isExcluded(relPath, isDir)) {
            continue;
          }

          let size = 0;
          if (!isDir) {
            try {
              size = fs.statSync(fullPath).size;
            } catch {
              size = 0;
            }
          }

          items.push({
            path: relPath,
            isDirectory: isDir,
            size,
          });

          if (isDir && recursive && depth < maxDepth) {
            walk(fullPath, depth + 1);
          }
        }
      }

      walk(safeDir, 1);

      const lines = items.map(
        (it) => `${it.isDirectory ? '[DIR] ' : '[FILE]'} ${it.path} (${it.size} B)`,
      );
      const output = lines.length > 0 ? lines.join('\n') : '(empty directory)';

      return {
        success: true,
        output,
        data: {
          items,
          totalCount: items.length,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to list directory '${subPath}': ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};

export const searchCodeTool: AgentTool<
  {
    query: string;
    path?: string | undefined;
    isRegex?: boolean | undefined;
    maxResults?: number | undefined;
  },
  { matches: Array<{ file: string; line: number; text: string }>; totalMatches: number }
> = {
  definition: {
    name: 'search_code',
    description: 'Searches for text or regex patterns across files in the workspace.',
    parameters: z.object({
      query: z.string().min(1).describe('Text string or regex pattern to search for'),
      path: z
        .string()
        .optional()
        .describe('Relative directory or file to search within (defaults to workspace root)'),
      isRegex: z
        .boolean()
        .optional()
        .describe('Whether query should be treated as a regular expression'),
      maxResults: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of matching lines to return (default 50)'),
    }),
  },
  async execute({ query, path: subPath = '.', isRegex = false, maxResults = 50 }, context) {
    try {
      const safeRoot = assertSafePath(subPath, context.workspaceRoot);
      const filter = createExclusionFilter(context.workspaceRoot);

      // Fast-path: Check FTS5 index if searching across full workspace without regex
      if (subPath === '.' && !isRegex) {
        try {
          const { getWorkspaceDb, getProjectId } = await import('./repo.js');
          const { CodeSearchEngine } = await import('@evolve/indexer');
          const db = getWorkspaceDb(context.workspaceRoot, context.database);
          const projectId = getProjectId(context.workspaceRoot, context.projectId);
          const engine = new CodeSearchEngine(db.sqlite, context.workspaceRoot);
          const ftsRes = engine.search(query, { projectId, maxResults });

          if (ftsRes.matches.length > 0) {
            const formatted = ftsRes.matches.map((m) => `${m.file}:${m.line} ${m.text}`).join('\n');
            return {
              success: true,
              output: formatted,
              data: {
                matches: ftsRes.matches,
                totalMatches: ftsRes.matches.length,
              },
            };
          }
        } catch {
          // Fall back to live file walk on error
        }
      }

      const matches: Array<{ file: string; line: number; text: string }> = [];

      let regex: RegExp;
      if (isRegex) {
        regex = new RegExp(query, 'i');
      } else {
        // Escape regex special chars for literal search
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(escaped, 'i');
      }

      function scanFile(filePath: string) {
        if (matches.length >= maxResults) return;

        const relPath = path.relative(context.workspaceRoot, filePath).replace(/\\/g, '/');
        if (filter.isExcluded(relPath, false)) {
          return;
        }

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= maxResults) break;
            const line = lines[i] ?? '';
            if (regex.test(line)) {
              matches.push({
                file: relPath,
                line: i + 1,
                text: line.trim(),
              });
            }
          }
        } catch {
          // Skip unreadable files
        }
      }

      function walk(current: string) {
        if (matches.length >= maxResults) return;

        const stat = fs.statSync(current);
        if (!stat.isDirectory()) {
          scanFile(current);
          return;
        }

        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          if (matches.length >= maxResults) break;
          const name = entry.name;
          const fullPath = path.join(current, name);
          const relPath = path.relative(context.workspaceRoot, fullPath).replace(/\\/g, '/');
          const isDir = entry.isDirectory();

          if (filter.isExcluded(relPath, isDir)) {
            continue;
          }

          if (isDir) {
            walk(fullPath);
          } else {
            scanFile(fullPath);
          }
        }
      }

      walk(safeRoot);

      const formatted = matches.map((m) => `${m.file}:${m.line} ${m.text}`).join('\n');
      const output = matches.length > 0 ? formatted : `No matches found for query '${query}'.`;

      return {
        success: true,
        output,
        data: {
          matches,
          totalMatches: matches.length,
        },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to search code for '${query}': ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      };
    }
  },
};
