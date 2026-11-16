import type { ModelMessage, ModelToolDefinition } from '@evolve/core';
import type { ToolRegistry } from '../tools/registry.js';

export interface ContextManagerOptions {
  workspaceRoot: string;
  systemPrompt?: string | undefined;
  maxTokens?: number | undefined;
}

/**
 * Handles system prompt construction, token estimation, and context-window
 * pruning while preserving tool-call pairing invariants.
 */
export class ContextManager {
  private readonly workspaceRoot: string;
  private readonly customSystemPrompt?: string | undefined;
  private readonly maxTokens: number;
  private readonly injectedMemories: Array<{ category: string; key: string; content: string }> = [];

  constructor(options: ContextManagerOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.customSystemPrompt = options.systemPrompt;
    this.maxTokens = options.maxTokens ?? 8192;
  }

  public injectMemories(
    memories: readonly { category: string; key: string; content: string }[],
  ): void {
    this.injectedMemories.push(...memories);
  }

  public clearInjectedMemories(): void {
    this.injectedMemories.length = 0;
  }

  public getSystemPrompt(): string {
    const coreInstructions = [
      'You are Evolve, an autonomous AI software engineering agent designed to solve development tasks reliably.',
      'You have access to tools to inspect your environment, read files, search code, and write code.',
      `Workspace root: ${this.workspaceRoot}`,
      '',
      'Repository Intelligence Guidelines:',
      '1. NEVER guess or invent repository files, architecture, or code. Always inspect actual files using your tools.',
      '2. To understand project architecture, tech stack, or frameworks: use `inspect_project` or `get_project_structure`.',
      '3. To locate functions, classes, interfaces, or models: use `find_symbol(name="...")`.',
      '4. To locate where a symbol, model, or route is used: use `find_references(symbol="...")`.',
      '5. To understand module imports, dependencies, or reverse importers: use `get_dependencies(path="...")` and `get_related_files(path="...")`.',
      '6. To search text or regex across code: use `search_code(query="...")`.',
      '7. To read specific code sections: use `read_file(path="...", startLine=..., endLine=...)`.',
      '8. When your task is finished, provide a clear, grounded final answer based strictly on real repository evidence without calling any more tools.',
    ].join('\n');

    const sections = [coreInstructions];

    if (this.customSystemPrompt) {
      sections.push('', this.customSystemPrompt);
    }

    if (this.injectedMemories.length > 0) {
      sections.push(
        '',
        'Relevant Past Experiences & Project Preferences:',
        ...this.injectedMemories.map((m) => `- [${m.category}] ${m.key}: ${m.content}`),
      );
    }

    return sections.join('\n');
  }

  /**
   * Fast rule-of-thumb token estimator (~4 chars per token).
   */
  public estimateTokens(text: string): number {
    if (!text || text.length === 0) {
      return 0;
    }
    return Math.max(1, Math.ceil(text.length / 4));
  }

  /**
   * Estimates tokens for a single ModelMessage including tool calls and metadata.
   */
  public estimateMessageTokens(message: ModelMessage): number {
    let tokens = 4; // Envelope and role overhead
    tokens += this.estimateTokens(message.content);

    if (message.name) {
      tokens += this.estimateTokens(message.name);
    }

    if (message.toolCalls && message.toolCalls.length > 0) {
      for (const tc of message.toolCalls) {
        tokens += 4; // Tool call envelope overhead
        tokens += this.estimateTokens(tc.name);
        tokens += this.estimateTokens(JSON.stringify(tc.arguments));
      }
    }

    return tokens;
  }

  /**
   * Estimates the aggregate tokens across all messages.
   */
  public estimateTotalTokens(messages: readonly ModelMessage[]): number {
    return messages.reduce((sum, msg) => sum + this.estimateMessageTokens(msg), 0);
  }

  /**
   * Constructs the message array for the model, ensuring the system prompt is present
   * and pruning messages if the context window limit is exceeded.
   */
  public buildContextMessages(conversationMessages: readonly ModelMessage[]): ModelMessage[] {
    const systemPrompt = this.getSystemPrompt();
    const systemMsg: ModelMessage = {
      role: 'system',
      content: systemPrompt,
    };

    const fullList: ModelMessage[] =
      conversationMessages.length > 0 && conversationMessages[0]?.role === 'system'
        ? [...conversationMessages]
        : [systemMsg, ...conversationMessages];

    const currentTotal = this.estimateTotalTokens(fullList);
    if (currentTotal <= this.maxTokens || fullList.length <= 3) {
      return fullList;
    }

    // Context limit exceeded -> prune older messages while preserving:
    // 1. Index 0 (system prompt)
    // 2. Index 1 (initial user goal, if present)
    // 3. Sliding window of recent turns from the end
    // Invariant: Do not break tool call and tool result pairs.
    const preservedHeader: ModelMessage[] = [];
    const firstMsg = fullList[0];
    if (firstMsg) {
      preservedHeader.push(firstMsg);
    }

    const secondMsg = fullList[1];
    let tailStartIndex = 1;
    if (secondMsg && secondMsg.role === 'user') {
      preservedHeader.push(secondMsg);
      tailStartIndex = 2;
    }

    const noticeMessage: ModelMessage = {
      role: 'system',
      content:
        '[Notice: Earlier conversation history was pruned to respect the context window limit.]',
    };

    const headerTokens =
      this.estimateTotalTokens(preservedHeader) + this.estimateMessageTokens(noticeMessage);
    const availableForTail = Math.max(500, this.maxTokens - headerTokens);

    // Collect messages from the end until availableForTail is reached
    const candidateTail: ModelMessage[] = [];
    let tailTokens = 0;

    for (let i = fullList.length - 1; i >= tailStartIndex; i--) {
      const msg = fullList[i];
      if (!msg) continue;

      const cost = this.estimateMessageTokens(msg);
      if (tailTokens + cost > availableForTail && candidateTail.length > 0) {
        break;
      }
      candidateTail.unshift(msg);
      tailTokens += cost;
    }

    // Validate tool pairing: if the first message in candidateTail is 'tool',
    // we must prepend its preceding assistant message if available
    const firstTail = candidateTail[0];
    if (firstTail && firstTail.role === 'tool') {
      // Find the index of firstTail in fullList
      const idxInFull = fullList.indexOf(firstTail);
      if (idxInFull > tailStartIndex) {
        const preceding = fullList[idxInFull - 1];
        if (preceding && preceding.role === 'assistant') {
          candidateTail.unshift(preceding);
        }
      }
    }

    return [...preservedHeader, noticeMessage, ...candidateTail];
  }

  /**
   * Helper to construct model tool definitions from a registry.
   */
  public constructModelTools(tools?: ToolRegistry): ModelToolDefinition[] | undefined {
    if (!tools) {
      return undefined;
    }
    const defs = tools.toModelDefinitions();
    return defs.length > 0 ? defs : undefined;
  }
}
