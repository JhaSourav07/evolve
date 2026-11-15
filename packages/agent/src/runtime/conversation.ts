import type { ModelMessage, ToolCall, ToolCallId } from '@evolve/core';

/**
 * Manages the sequential conversation history of an agent session,
 * guaranteeing consistent role ordering and tool call pairing.
 */
export class ConversationManager {
  private readonly messages: ModelMessage[] = [];

  public addSystemMessage(content: string): void {
    this.messages.push({
      role: 'system',
      content,
    });
  }

  public addUserMessage(content: string): void {
    this.messages.push({
      role: 'user',
      content,
    });
  }

  public addAssistantMessage(content: string, toolCalls?: ToolCall[]): void {
    this.messages.push({
      role: 'assistant',
      content,
      ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    });
  }

  public addToolResult(toolCallId: ToolCallId, output: string, toolName?: string): void {
    this.messages.push({
      role: 'tool',
      content: output,
      toolCallId,
      ...(toolName ? { name: toolName } : {}),
    });
  }

  public getMessages(): readonly ModelMessage[] {
    return [...this.messages];
  }

  public getLastMessage(): ModelMessage | undefined {
    return this.messages[this.messages.length - 1];
  }

  public getLastAssistantMessage(): ModelMessage | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i]?.role === 'assistant') {
        return this.messages[i];
      }
    }
    return undefined;
  }

  public count(): number {
    return this.messages.length;
  }

  public clear(): void {
    this.messages.length = 0;
  }

  public toJSON(): string {
    return JSON.stringify(this.messages, null, 2);
  }

  public fromJSON(jsonStr: string): void {
    const parsed = JSON.parse(jsonStr) as ModelMessage[];
    this.clear();
    this.messages.push(...parsed);
  }
}
