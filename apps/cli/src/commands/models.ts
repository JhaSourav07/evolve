import React from 'react';
import { render } from 'ink';
import { ModelsList, type ModelItem } from '../components/ModelsList.js';
import { CliContext } from '../context.js';

export async function runModelsCommand(): Promise<void> {
  const context = new CliContext();
  const health = await context.provider.checkHealth();

  let models: ModelItem[];
  try {
    const discovered = await context.provider.listModels();
    models = discovered.map((m) => ({
      name: m.name,
      size: m.size ? `${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB` : undefined,
      modifiedAt: m.modifiedAt,
      isActive: m.name === context.config.model.model,
    }));
  } catch {
    models = [];
  }

  const app = render(
    React.createElement(ModelsList, {
      models,
      isOnline: health.isHealthy,
      providerUrl: context.config.model.baseUrl,
    }),
    { patchConsole: false },
  );
  app.unmount();
  context.close();
}
