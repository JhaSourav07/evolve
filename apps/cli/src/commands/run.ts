import React from 'react';
import { render } from 'ink';
import type { Plan } from '@evolve/core';
import { CliContext } from '../context.js';
import { InteractiveApp } from '../screens/InteractiveApp.js';

export interface RunCommandOptions {
  autoApprove?: boolean | undefined;
  verify?: boolean | undefined;
  testCommand?: string | undefined;
  model?: string | undefined;
  rootDir?: string | undefined;
  headless?: boolean | undefined;
}

export async function runExecuteCommand(
  planIdArg?: string | undefined,
  options: RunCommandOptions = {},
): Promise<void> {
  const context = new CliContext({
    rootDir: options.rootDir,
    ...(options.model ? { modelName: options.model } : {}),
  });

  try {
    // If headless execution is requested, run directly via console
    if (options.headless) {
      let targetPlan: Plan | undefined;

      if (planIdArg) {
        targetPlan = context.planRepo.findById(planIdArg);
        if (!targetPlan) {
          console.error(`Plan not found with ID: ${planIdArg}`);
          process.exitCode = 1;
          return;
        }
      } else {
        const projectPlans = context.planRepo.findByProjectId(context.projectId);
        targetPlan = projectPlans.find((p) => p.status === 'approved') || projectPlans[0];
        if (!targetPlan) {
          console.log('No implementation plans found to execute.');
          console.log('Run `evolve plan "your objective"` to generate a plan first.');
          return;
        }
      }

      console.log(`\n✦ EVOLVE — EXECUTING PLAN: ${targetPlan.title}`);
      console.log(`Plan ID: ${targetPlan.planId} (${targetPlan.status.toUpperCase()})`);
      console.log(`Tasks: ${targetPlan.tasks.length} | Mode: ${targetPlan.mode}\n`);

      const executor = context.createPlanExecutor();

      const result = await executor.executePlan(targetPlan, {
        autoApprove: options.autoApprove,
        verifyAfterTask: options.verify !== false,
        customTestCommand: options.testCommand,
        onTaskProgress: (task, status) => {
          console.log(`• Task [${status.toUpperCase()}]: ${task.title}`);
        },
      });

      console.log(`\nExecution ${result.status.toUpperCase()} in ${(result.durationMs / 1000).toFixed(1)}s.`);
      console.log(`Tasks completed: ${result.tasksCompleted}/${targetPlan.tasks.length}`);
      if (result.tasksFailed > 0) {
        console.log(`Tasks failed: ${result.tasksFailed}`);
      }
      if (result.error) {
        console.error(`Error: ${result.error}`);
        process.exitCode = 1;
      }
      return;
    }

    // Interactive execution session
    const initialPrompt = planIdArg ? `/run ${planIdArg.trim()}` : '/run';

    const app = render(
      React.createElement(InteractiveApp, {
        context,
        initialPrompt,
        initialModel: options.model,
        initialScreen: 'chat',
      }),
      { patchConsole: false },
    );

    await app.waitUntilExit();
  } finally {
    context.close();
  }
}
