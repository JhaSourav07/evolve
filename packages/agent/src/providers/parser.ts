import { randomUUID } from 'node:crypto';
import type { ToolCall, ToolCallId } from '@evolve/core';

interface RawOllamaToolCall {
  id?: string;
  function?: {
    name?: string;
    arguments?: Record<string, unknown> | string;
  };
}

export function normalizeToolArguments(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === 'true') {
        result[key] = true;
      } else if (trimmed === 'false') {
        result[key] = false;
      } else if (/^-?\d+(\.\d+)?$/.test(trimmed) && !isNaN(Number(trimmed))) {
        result[key] = Number(trimmed);
      } else {
        result[key] = value;
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = normalizeToolArguments(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Removes raw tool call markup (e.g. <tool_call> tags or ```tool_call blocks) from message text.
 */
export function cleanToolCallMarkup(content: string): string {
  if (!content) return '';
  return content
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/```(?:tool_call|json)?\s*\{[\s\S]*?"name"[\s\S]*?\}\s*```/gi, '')
    .trim();
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
      result.push({ id, name, arguments: normalizeToolArguments(args) });
    }

    if (result.length > 0) {
      return result;
    }
  }

  // 2. Fallback: Parse XML-style <tool_call>...</tool_call> tags (Qwen & Anthropic format)
  if (contentFallback && contentFallback.includes('<tool_call>')) {
    const xmlRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
    let match: RegExpExecArray | null;
    while ((match = xmlRegex.exec(contentFallback)) !== null) {
      const block = match[1]?.trim();
      if (!block) continue;
      try {
        const parsed = JSON.parse(block);
        if (parsed.name && (parsed.arguments || parsed.parameters)) {
          const rawArguments = (parsed.arguments || parsed.parameters || {}) as Record<
            string,
            unknown
          >;
          result.push({
            id: `call_${randomUUID().slice(0, 8)}` as ToolCallId,
            name: parsed.name,
            arguments: normalizeToolArguments(rawArguments),
          });
        }
      } catch {
        // Ignore malformed individual XML tool calls
      }
    }

    if (result.length > 0) {
      return result;
    }
  }

  // 3. Fallback: Parse structured tool call JSON inside markdown fences (both object and array)
  if (contentFallback && contentFallback.trim().length > 0) {
    const jsonMatch = contentFallback.match(
      /```(?:json|tool_call)?\s*([[{][\s\S]*?[\]}])\s*```/,
    );
    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.name && (item.arguments || item.parameters)) {
              result.push({
                id: `call_${randomUUID().slice(0, 8)}` as ToolCallId,
                name: item.name,
                arguments: normalizeToolArguments(item.arguments || item.parameters || {}),
              });
            }
          }
        } else if (parsed.name && (parsed.arguments || parsed.parameters)) {
          const rawArguments = (parsed.arguments || parsed.parameters || {}) as Record<
            string,
            unknown
          >;
          result.push({
            id: `call_${randomUUID().slice(0, 8)}` as ToolCallId,
            name: parsed.name,
            arguments: normalizeToolArguments(rawArguments),
          });
        }
      } catch {
        // Ignore fallback parse error
      }
    }
  }

  return result;
}
