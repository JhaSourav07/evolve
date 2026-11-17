import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CliContext } from '../context.js';
import { Theme } from '../components/Theme.js';

export async function runInitCommand(
  options: { rootDir?: string | undefined } = {},
): Promise<void> {
  const rootDir = options.rootDir ?? process.cwd();
  const evolveDir = join(rootDir, '.evolve');

  console.log(`\n${Theme.icons.sparkle} Initializing Evolve project at: ${rootDir}`);

  if (!existsSync(evolveDir)) {
    mkdirSync(evolveDir, { recursive: true });
    console.log(`  ${Theme.icons.check} Created directory: .evolve/`);
  } else {
    console.log(`  ${Theme.icons.bullet} Existing directory found: .evolve/`);
  }

  // Create default configuration file if not present
  const configFile = join(evolveDir, 'config.json');
  if (!existsSync(configFile)) {
    // Attempt to discover local Ollama models for a sensible default
    let defaultModel = 'qwen2.5-coder:7b';
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      if (res.ok) {
        const data = (await res.json()) as { models?: Array<{ name: string }> };
        if (data.models && data.models.length > 0) {
          const found =
            data.models.find((m) => m.name.toLowerCase().includes('coder')) ||
            data.models.find((m) => m.name.toLowerCase().includes('qwen')) ||
            data.models[0];
          if (found) {
            defaultModel = found.name;
          }
        }
      }
    } catch {
      // offline / Ollama not running at init
    }

    const defaultConfig = {
      model: {
        provider: 'ollama',
        model: defaultModel,
        baseUrl: 'http://localhost:11434',
        temperature: 0.2,
        contextWindow: 16384,
      },
      security: {
        requireApprovalForCommands: true,
        allowShellExecution: true,
      },
      storage: {
        dbPath: '.evolve/evolve.db',
        enableWal: true,
      },
    };
    writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2), 'utf8');
    console.log(`  ${Theme.icons.check} Created default config: .evolve/config.json (Model: ${defaultModel})`);
  }

  // Initialize SQLite database and register project
  const context = new CliContext({ rootDir });
  console.log(`  ${Theme.icons.check} Initialized SQLite database: .evolve/evolve.db`);
  console.log(
    `  ${Theme.icons.check} Registered project: "${context.rootDir.split('/').pop()}" (${context.projectId})`,
  );

  context.close();
  console.log(
    `\n${Theme.icons.check} Project successfully initialized! Run \`evolve\` to start coding.\n`,
  );
}
