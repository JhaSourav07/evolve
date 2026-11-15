import React from 'react';
import { render } from 'ink';
import { CliContext } from '../context.js';
import { InteractiveApp } from '../screens/InteractiveApp.js';

export async function runChatCommand(prompt?: string, model?: string): Promise<void> {
  const context = new CliContext(model ? { modelName: model } : {});
  const app = render(
    React.createElement(InteractiveApp, {
      context,
      initialPrompt: prompt,
      initialModel: model,
      initialScreen: model ? 'chat' : prompt ? 'chat' : 'model_select',
    }),
    { patchConsole: false },
  );
  await app.waitUntilExit();
  context.close();
}
