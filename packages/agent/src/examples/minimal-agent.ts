import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OllamaProvider } from '../providers/ollama.js';
import { AgentRuntime } from '../runtime/agent.js';
import { createDefaultToolRegistry } from '../tools/registry.js';

/**
 * Creates and configures a minimal Evolve agent instance wired to a local Ollama server.
 */
export async function createMinimalOllamaAgent(options?: {
  workspaceRoot?: string;
  baseUrl?: string;
  model?: string;
  maxSteps?: number;
}) {
  const workspaceRoot =
    options?.workspaceRoot ?? fs.mkdtempSync(path.join(os.tmpdir(), 'evolve-agent-'));
  const provider = new OllamaProvider({
    baseUrl: options?.baseUrl ?? 'http://localhost:11434',
    ...(options?.model ? { model: options.model } : {}),
  });

  // Ensure an appropriate model is selected from local Ollama
  if (!options?.model) {
    await provider.autoSelectModel();
  }

  const tools = createDefaultToolRegistry();

  const runtime = new AgentRuntime({
    provider,
    tools,
    config: {
      workspaceRoot,
      maxSteps: options?.maxSteps ?? 10,
      temperature: 0.2,
    },
  });

  return {
    runtime,
    provider,
    tools,
    workspaceRoot,
  };
}

/**
 * Optional standalone execution script for manual demonstration.
 */
async function main() {
  console.log('--- Initializing Minimal Evolve Agent with Ollama ---');
  const agent = await createMinimalOllamaAgent();
  console.log(`Active Model: ${agent.provider.name}`);
  console.log(`Workspace: ${agent.workspaceRoot}`);

  // Create sample input file in workspace
  const sampleFile = path.join(agent.workspaceRoot, 'hello.txt');
  fs.writeFileSync(sampleFile, 'Hello from local Evolve agent!', 'utf-8');

  // Subscribe to observable runtime events
  agent.runtime.onAny((envelope) => {
    console.log(`[EVENT] ${envelope.type} (${envelope.id})`);
  });

  const prompt = 'Read hello.txt, append " - Task solved!", and write it to result.txt.';
  console.log(`\nExecuting prompt: "${prompt}"\n`);

  const result = await agent.runtime.run(prompt);
  console.log('\n--- Execution Result ---');
  console.log(`Success: ${result.success}`);
  console.log(`Steps: ${result.stepsExecuted}`);
  console.log(`Duration: ${result.durationMs}ms`);
  console.log(`Summary: ${result.finalResponse}`);

  const resultFile = path.join(agent.workspaceRoot, 'result.txt');
  if (fs.existsSync(resultFile)) {
    console.log(`Result file content: ${fs.readFileSync(resultFile, 'utf-8')}`);
  }
}

if (process.env['RUN_MINIMAL_AGENT'] === '1') {
  main().catch(console.error);
}
