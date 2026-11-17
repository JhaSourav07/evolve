import type { AgentTool, ModelToolDefinition } from '@evolve/core';
import { z } from 'zod';
import { runCommandTool, runTestsTool } from './execution.js';
import {
  createFileTool,
  deleteFileTool,
  editFileTool,
  getFileDiffTool,
  listFilesTool,
  readFileTool,
  searchCodeTool,
  writeFileTool,
} from './filesystem.js';
import { gitDiffTool, gitStatusTool } from './git.js';
import {
  findReferencesTool,
  findSymbolTool,
  getDependenciesTool,
  getProjectStructureTool,
  getRelatedFilesTool,
  inspectProjectTool,
} from './repo.js';

export class ToolRegistry {
  private readonly tools: Map<string, AgentTool<unknown, unknown>> = new Map();

  public register<TParams, TData>(tool: AgentTool<TParams, TData>): void {
    if (this.tools.has(tool.definition.name)) {
      throw new Error(`Tool already registered: ${tool.definition.name}`);
    }
    this.tools.set(tool.definition.name, tool as AgentTool<unknown, unknown>);
  }

  public get(name: string): AgentTool<unknown, unknown> | undefined {
    return this.tools.get(name);
  }

  public has(name: string): boolean {
    return this.tools.has(name);
  }

  public list(): AgentTool<unknown, unknown>[] {
    return Array.from(this.tools.values());
  }

  /**
   * Registers all standard Evolve tools, including Repository Intelligence.
   */
  public registerDefaultTools(): this {
    const defaultTools: AgentTool<unknown, unknown>[] = [
      // Repository Intelligence Tools
      inspectProjectTool as AgentTool<unknown, unknown>,
      getProjectStructureTool as AgentTool<unknown, unknown>,
      findSymbolTool as AgentTool<unknown, unknown>,
      findReferencesTool as AgentTool<unknown, unknown>,
      getDependenciesTool as AgentTool<unknown, unknown>,
      getRelatedFilesTool as AgentTool<unknown, unknown>,

      // Filesystem & Exploration Tools
      readFileTool as AgentTool<unknown, unknown>,
      writeFileTool as AgentTool<unknown, unknown>,
      createFileTool as AgentTool<unknown, unknown>,
      editFileTool as AgentTool<unknown, unknown>,
      deleteFileTool as AgentTool<unknown, unknown>,
      getFileDiffTool as AgentTool<unknown, unknown>,
      listFilesTool as AgentTool<unknown, unknown>,
      searchCodeTool as AgentTool<unknown, unknown>,

      // Execution & Testing Tools
      runCommandTool as AgentTool<unknown, unknown>,
      runTestsTool as AgentTool<unknown, unknown>,

      // Git Tools
      gitStatusTool as AgentTool<unknown, unknown>,
      gitDiffTool as AgentTool<unknown, unknown>,
    ];

    for (const tool of defaultTools) {
      if (!this.has(tool.definition.name)) {
        this.register(tool);
      }
    }

    return this;
  }

  /**
   * Formats registered tools into ModelToolDefinition[] required by ModelProvider.
   */
  public toModelDefinitions(): ModelToolDefinition[] {
    return this.list().map((tool) => {
      let schemaObj: Record<string, unknown> = { type: 'object' };

      // Convert Zod schema to JSON-schema structure
      const params = tool.definition.parameters as unknown;
      if (params && typeof params === 'object' && 'shape' in params) {
        const shape = (params as { shape: Record<string, unknown> }).shape;
        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        for (const [key, rawVal] of Object.entries(shape)) {
          let val = rawVal as Record<string, unknown>;
          const isOptional = val instanceof z.ZodOptional;
          if (isOptional && '_def' in val && (val as { _def: { innerType?: unknown } })._def.innerType) {
            val = (val as { _def: { innerType: Record<string, unknown> } })._def.innerType;
          }

          let propType = 'string';
          let enumValues: string[] | undefined;

          if (val instanceof z.ZodString) {
            propType = 'string';
          } else if (val instanceof z.ZodNumber) {
            propType = 'number';
          } else if (val instanceof z.ZodBoolean) {
            propType = 'boolean';
          } else if (val instanceof z.ZodEnum) {
            propType = 'string';
            const enumObj = val as unknown as {
              options?: string[];
              _def?: { values?: Record<string, string> | string[] };
            };
            if (Array.isArray(enumObj.options)) {
              enumValues = enumObj.options;
            } else if (enumObj._def && Array.isArray(enumObj._def.values)) {
              enumValues = enumObj._def.values;
            } else if (enumObj._def?.values && typeof enumObj._def.values === 'object') {
              enumValues = Object.keys(enumObj._def.values);
            }
          }

          const desc =
            ('description' in val && typeof val.description === 'string' ? val.description : undefined) ||
            ('description' in (rawVal as object) && typeof (rawVal as { description: unknown }).description === 'string'
              ? (rawVal as { description: string }).description
              : undefined);

          properties[key] = {
            type: propType,
            ...(desc ? { description: desc } : {}),
            ...(enumValues ? { enum: enumValues } : {}),
          };

          if (!isOptional) {
            required.push(key);
          }
        }

        schemaObj = {
          type: 'object',
          properties,
          ...(required.length > 0 ? { required } : {}),
        };
      }

      return {
        name: tool.definition.name,
        description: tool.definition.description,
        parameters: schemaObj,
      };
    });
  }
}

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  return registry.registerDefaultTools();
}
