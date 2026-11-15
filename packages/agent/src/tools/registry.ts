import type { AgentTool, ModelToolDefinition } from '@evolve/core';
import { z } from 'zod';

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

        for (const [key, val] of Object.entries(shape)) {
          properties[key] = { type: 'string' }; // fallback default
          if (val instanceof z.ZodString) {
            properties[key] = { type: 'string' };
          } else if (val instanceof z.ZodNumber) {
            properties[key] = { type: 'number' };
          } else if (val instanceof z.ZodBoolean) {
            properties[key] = { type: 'boolean' };
          }

          if (!(val instanceof z.ZodOptional)) {
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
