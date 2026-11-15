import { randomUUID } from 'node:crypto';
import type { ToolCall, ToolCallId } from '@evolve/core';

interface RawOllamaToolCall {
  id?: string;
  function?: {
    name?: string;
    arguments?: Record<string, unknown> | string;
  };
}

/**
 * Normalizes tool calls from Ollama API responses (both native and fallback formats).
 */
export function parseOllamaToolCalls(
  rawToolCalls?: RawOllamaToolCall[],
  contentFallback?: string,
): ToolCall[] {
  const result: ToolCall[] = [];

  // 1. Process native Ollama tool calls
  if (rawToolCalls && rawToolCalls.length > 0) {
    for (const call of rawToolCalls) {
      const name = call.function?.name;
      if (!name) continue;

      let args: Record<string, unknown> = {};
      const rawArgs = call.function?.arguments;

      if (typeof rawArgs === 'string') {
        try {
          args = JSON.parse(rawArgs);
        } catch {
          args = { raw: rawArgs };
        }
      } else if (rawArgs && typeof rawArgs === 'object') {
        args = rawArgs;
      }

      const id = (call.id || `call_${randomUUID().slice(0, 8)}`) as ToolCallId;
      result.push({ id, name, arguments: args });
    }

    if (result.length > 0) {
      return result;
    }
  }

  // 2. Fallback: Parse structured tool call JSON inside markdown or XML tags
  if (contentFallback && contentFallback.trim().length > 0) {
    const jsonMatch = contentFallback.match(/```(?:json|tool_call)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.name && (parsed.arguments || parsed.parameters)) {
          result.push({
            id: `call_${randomUUID().slice(0, 8)}` as ToolCallId,
            name: parsed.name,
            arguments: parsed.arguments || parsed.parameters || {},
          });
        }
      } catch {
        // Ignore fallback parse error
      }
    }
  }

  return result;
}
