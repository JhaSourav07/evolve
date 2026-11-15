import React from 'react';
import { render } from 'ink';
import { MemoryList } from '../components/MemoryList.js';
import { CliContext } from '../context.js';
import { Theme } from '../components/Theme.js';

export async function runMemoryCommand(options?: {
  add?: boolean;
  category?: string;
  key?: string;
  content?: string;
}): Promise<void> {
  const context = new CliContext();

  if (options?.add && options.category && options.key && options.content) {
    const validCategory =
      options.category === 'project_rule' || options.category === 'experience'
        ? options.category
        : 'user_preference';

    context.memoryService.saveMemory(validCategory, options.key, options.content, {
      projectId: context.projectId,
    });
    console.log(
      `\n${Theme.icons.check} Stored memory: [${validCategory}] ${options.key} -> "${options.content}"\n`,
    );
    context.close();
    return;
  }

  const raw = context.memoryService.search('', { projectId: context.projectId, limit: 50 });
  const memories = raw.map((m) => ({
    id: m.id,
    category: m.category,
    key: m.key,
    content: m.content,
  }));

  const app = render(React.createElement(MemoryList, { memories }), {
    patchConsole: false,
  });
  app.unmount();
  context.close();
}
