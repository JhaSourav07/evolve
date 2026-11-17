import React from 'react';
import { render } from 'ink';
import type { PlanId } from '@evolve/core';
import { CliContext } from '../context.js';
import { InteractiveApp } from '../screens/InteractiveApp.js';

export interface PlanCommandOptions {
  mode?: 'quick' | 'detailed' | undefined;
  approve?: string | undefined;
  reject?: string | undefined;
  history?: boolean | undefined;
  model?: string | undefined;
  rootDir?: string | undefined;
}

export async function runPlanCommand(
  request?: string | undefined,
  options: PlanCommandOptions = {},
): Promise<void> {
  const context = new CliContext({
    rootDir: options.rootDir,
    ...(options.model ? { modelName: options.model } : {}),
  });

  try {
    // Non-interactive subactions if requested
    if (options.approve) {
      const plan = await context.planner.approvePlan(options.approve as PlanId);
      console.log(`Plan ${plan.planId} approved successfully.`);
      console.log(`Title: ${plan.title}`);
      console.log(`Tasks: ${plan.tasks.length}`);
      console.log(`Status: ${plan.status}`);
      return;
    }

    if (options.reject) {
      const plan = await context.planner.rejectPlan(options.reject as PlanId);
      console.log(`Plan ${plan.planId} rejected.`);
      console.log(`Title: ${plan.title}`);
      console.log(`Status: ${plan.status}`);
      return;
    }

    if (options.history) {
      const plans = context.planner.listPlans(context.projectId);
      if (plans.length === 0) {
        console.log('No implementation plans found for this project.');
        console.log('Run `evolve plan "your objective"` to create your first plan.');
        return;
      }

      console.log(`Implementation Plans (${plans.length}):\n`);
      for (const p of plans) {
        console.log(`- [${p.status.toUpperCase()}] ${p.title} (ID: ${p.planId})`);
        console.log(`  Tasks: ${p.tasks.length} | Mode: ${p.mode} | Complexity: ${p.estimatedComplexity} | Rev: ${p.revision}`);
        console.log(`  Created: ${new Date(p.createdAt).toLocaleString()}\n`);
      }
      return;
    }

    // Interactive plan session
    let initialPrompt: string | undefined;
    if (request && request.trim()) {
      const modePrefix = options.mode === 'quick' ? 'quick ' : '';
      initialPrompt = `/plan ${modePrefix}${request.trim()}`;
    }

    const app = render(
      React.createElement(InteractiveApp, {
        context,
        initialPrompt,
        initialModel: options.model,
        initialScreen: initialPrompt ? 'chat' : 'plan_history',
      }),
      { patchConsole: false },
    );

    await app.waitUntilExit();
  } finally {
    context.close();
  }
}
