import fs from 'node:fs';
import path from 'node:path';
import { assertPathInsideWorkspace, type AgentTool } from '@evolve/core';
import { z } from 'zod';

export const readFileTool: AgentTool<{ path: string }, { content: string }> = {
  definition: {
    name: 'read_file',
    description: 'Reads content from a file inside the workspace.',
    parameters: z.object({
      path: z.string().min(1).describe('Relative path to the file to read'),
    }),
  },
  async execute({ path: targetPath }, context) {
    try {
      const safePath = assertPathInsideWorkspace(targetPath, context.workspaceRoot);
      if (!fs.existsSync(safePath)) {
        return {
          success: false,
          output: `File not found: ${targetPath}`,
          error: 'FILE_NOT_FOUND',
        };
      }

      const content = fs.readFileSync(safePath, 'utf-8');
      return {
        success: true,
        output: content,
        data: { content },
      };
    } catch (err) {
      return {
        success: false,
        output: `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`,
        error: String(err),
      };
    }
  },
};

export const writeFileTool: AgentTool<{ path: string; content: string }, { bytesWritten: number }> =
  {
    definition: {
      name: 'write_file',
      description: 'Creates or updates a file inside the workspace.',
      parameters: z.object({
        path: z.string().min(1).describe('Relative path to the file to write'),
        content: z.string().describe('File content to write'),
      }),
    },
    async execute({ path: targetPath, content }, context) {
      try {
        const safePath = assertPathInsideWorkspace(targetPath, context.workspaceRoot);
        const parentDir = path.dirname(safePath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        fs.writeFileSync(safePath, content, 'utf-8');
        return {
          success: true,
          output: `Successfully wrote ${content.length} characters to ${targetPath}`,
          data: { bytesWritten: content.length },
        };
      } catch (err) {
        return {
          success: false,
          output: `Failed to write file: ${err instanceof Error ? err.message : 'Unknown error'}`,
          error: String(err),
        };
      }
    },
  };
