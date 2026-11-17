#!/usr/bin/env node
import { Command } from 'commander';
import {
  createSessionId,
  EvolveConfigSchema,
  getEvolveInfo,
  InMemoryEventBus,
  validateOrThrow,
  type EvolveConfig,
  type SessionId,
} from '@evolve/core';
import { runChatCommand } from './commands/chat.js';
import { runConfigCommand } from './commands/config.js';
import { runFeedbackCommand } from './commands/feedback.js';
import { runHistoryCommand } from './commands/history.js';
import { runInitCommand } from './commands/init.js';
import { runIntegrationsCommand } from './commands/integrations.js';
import { runMemoryCommand } from './commands/memory.js';
import { runModelsCommand } from './commands/models.js';
import { runPlanCommand } from './commands/plan.js';
import { runExecuteCommand } from './commands/run.js';
import { runStatusCommand } from './commands/status.js';

export function formatCliBanner(): string {
  const info = getEvolveInfo();
  return `${info.name} v${info.version} (Local-First: ${info.localFirst ? 'true' : 'false'})`;
}

export interface CliSession {
  sessionId: SessionId;
  config: EvolveConfig;
  events: InMemoryEventBus;
}

export function initCliSession(rootDir: string): CliSession {
  const config = validateOrThrow(EvolveConfigSchema, {
    workspace: { rootDir },
  });
  const sessionId = createSessionId();
  const events = new InMemoryEventBus();

  return { sessionId, config, events };
}

export function buildCli(): Command {
  const info = getEvolveInfo();
  const program = new Command();

  program
    .name('evolve')
    .description('Autonomous, local-first AI software engineering agent')
    .version(info.version);

  // Default action: Launch interactive mode
  program
    .option('-m, --model <model>', 'Ollama model to use')
    .action(async (opts: { model?: string }) => {
      await runChatCommand(undefined, opts.model);
    });

  program
    .command('chat [prompt]')
    .description('Start interactive conversation or execute a single task prompt')
    .option('-m, --model <model>', 'Ollama model to use')
    .action(async (prompt?: string, opts?: { model?: string }) => {
      await runChatCommand(prompt, opts?.model);
    });

  program
    .command('plan [request]')
    .description('Generate, inspect, approve, or reject repository-aware implementation plans')
    .option('--mode <mode>', 'Planning mode: quick | detailed', 'detailed')
    .option('--approve <planId>', 'Approve a plan for execution')
    .option('--reject <planId>', 'Reject a plan')
    .option('--history', 'List previous plans for this project')
    .option('-m, --model <model>', 'Ollama model to use')
    .action(
      async (
        request?: string,
        opts?: {
          mode?: 'quick' | 'detailed';
          approve?: string;
          reject?: string;
          history?: boolean;
          model?: string;
        },
      ) => {
        await runPlanCommand(request, opts);
      },
    );

  program
    .command('run [planId]')
    .description('Execute an approved implementation plan with verification and debugging')
    .option('--auto-approve', 'Automatically approve all tool executions without interactive prompts')
    .option('--no-verify', 'Skip post-task verification stages')
    .option('--test-command <cmd>', 'Custom test runner command to execute during verification')
    .option('--headless', 'Run directly in terminal without interactive Ink TUI')
    .option('-m, --model <model>', 'Ollama model to use')
    .action(
      async (
        planId?: string,
        opts?: {
          autoApprove?: boolean;
          verify?: boolean;
          testCommand?: string;
          headless?: boolean;
          model?: string;
        },
      ) => {
        await runExecuteCommand(planId, opts);
      },
    );

  program
    .command('init')
    .description('Initialize Evolve in the current repository')
    .option('-r, --root <dir>', 'Project root directory')
    .action(async (opts: { root?: string }) => {
      await runInitCommand({ rootDir: opts.root });
    });

  program
    .command('status')
    .description('Display project, model, and system status')
    .action(async () => {
      await runStatusCommand();
    });

  program
    .command('history')
    .description('List previous agent sessions in this project')
    .action(async () => {
      await runHistoryCommand();
    });

  program
    .command('memory [subcommand] [args...]')
    .description('Inspect, search, review, or record persistent memories and experiences')
    .option('-a, --add', 'Add a memory entry')
    .option(
      '-c, --category <category>',
      'Memory category: user_preference | project_rule | experience | architecture_decision | failed_attempt',
    )
    .option('-k, --key <key>', 'Memory key')
    .option('--content <content>', 'Memory content')
    .action(
      async (
        subcommand?: string,
        args?: string[],
        opts?: { add?: boolean; category?: string; key?: string; content?: string },
      ) => {
        await runMemoryCommand({
          subcommand,
          args,
          add: opts?.add,
          category: opts?.category,
          key: opts?.key,
          content: opts?.content,
        });
      },
    );

  program
    .command('integrations')
    .description('View and manage interaction integrations and consent')
    .option('-i, --import <file>', 'Import conversation export JSON (Claude or Gemini)')
    .action(async (opts: { import?: string }) => {
      await runIntegrationsCommand({ importFile: opts.import });
    });

  program
    .command('feedback')
    .description('Review feedback history or submit rating on previous response')
    .option('-r, --rating <rating>', 'Rating: 1 (correct), 0 (partial), -1 (incorrect)')
    .option('-n, --notes <notes>', 'Feedback notes or explanation')
    .option('--correction <correction>', 'Written code correction')
    .action(async (opts: { rating?: string; notes?: string; correction?: string }) => {
      await runFeedbackCommand(opts);
    });

  program
    .command('config')
    .description('Display active configuration settings')
    .action(async () => {
      await runConfigCommand();
    });

  program
    .command('models')
    .description('Discover available local Ollama models')
    .action(async () => {
      await runModelsCommand();
    });

  return program;
}

export async function runCli(): Promise<void> {
  const program = buildCli();
  await program.parseAsync(process.argv);
}

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  runCli().catch((err) => {
    console.error('Fatal CLI Error:', err);
    process.exit(1);
  });
}
