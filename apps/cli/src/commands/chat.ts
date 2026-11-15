import React from 'react';
import { render } from 'ink';
import { CliContext } from '../context.js';
import { InteractiveApp } from '../screens/InteractiveApp.js';

export async function runChatCommand(prompt?: string): Promise<void> {
  const context = new CliContext();
  const app = render(
    React.createElement(InteractiveApp, {
      context,
      initialPrompt: prompt,
      initialScreen: 'chat',
    }),
    { patchConsole: false },
  );
  await app.waitUntilExit();
  context.close();
}
