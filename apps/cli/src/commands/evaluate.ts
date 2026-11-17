import React from 'react';
import { render } from 'ink';
import type { EvaluationOverallStatus, FailureCategory, TaskEvaluationReport } from '@evolve/core';
import { CliContext } from '../context.js';
import { EvaluationCard } from '../components/EvaluationCard.js';
import { Theme } from '../components/Theme.js';

export interface EvaluateCommandOptions {
  subcommand?: string | undefined;
  args?: string[] | undefined;
  status?: string | undefined;
  rating?: string | undefined;
  category?: string | undefined;
}

export async function runEvaluateCommand(options?: EvaluateCommandOptions): Promise<void> {
  const context = new CliContext();
  const subcommand = options?.subcommand?.toLowerCase() || 'list';
  const args = options?.args || [];

  try {
    switch (subcommand) {
      case 'inspect': {
        const id = args[0];
        if (!id) {
          console.log(`\nUsage: evolve evaluate inspect <evaluationId>\n`);
          return;
        }
        const report = context.feedbackService.getEvaluation(id);
        if (!report) {
          console.error(`\n${Theme.icons.cross} Evaluation "${id}" not found.\n`);
          return;
        }

        const app = render(
          React.createElement(EvaluationCard, { evaluation: report }),
          { patchConsole: false },
        );
        app.unmount();
        return;
      }

      case 'task': {
        const taskId = args[0];
        if (!taskId) {
          console.log(`\nUsage: evolve evaluate task <taskId>\n`);
          return;
        }
        const evaluations = context.feedbackService.listEvaluations(context.projectId);
        const match = evaluations.find((e: TaskEvaluationReport) => e.taskId === taskId);
        if (!match) {
          console.error(`\n${Theme.icons.cross} No evaluation found for task "${taskId}".\n`);
          return;
        }

        const app = render(
          React.createElement(EvaluationCard, { evaluation: match }),
          { patchConsole: false },
        );
        app.unmount();
        return;
      }

      case 'plan': {
        const planId = args[0];
        if (!planId) {
          console.log(`\nUsage: evolve evaluate plan <planId>\n`);
          return;
        }
        const evaluations = context.feedbackService
          .listEvaluations(context.projectId)
          .filter((e: TaskEvaluationReport) => e.planId === planId);

        if (evaluations.length === 0) {
          console.log(`\n${Theme.icons.bulletOpen} No evaluations found for plan "${planId}".\n`);
          return;
        }

        console.log(`\n${Theme.icons.sparkle} EVALUATIONS FOR PLAN: ${planId}\n`);
        for (const evalReport of evaluations) {
          const statusIcon =
            evalReport.overallStatus === 'verified'
              ? Theme.icons.check
              : evalReport.overallStatus === 'failed'
                ? Theme.icons.cross
                : Theme.icons.bulletOpen;
          console.log(
            `  ${statusIcon} Task: ${evalReport.taskId ?? 'N/A'} | Status: ${evalReport.overallStatus.toUpperCase()} | Coverage: ${evalReport.requirementCoverage} | Training: ${evalReport.trainingEligible ? 'Eligible' : 'No'}`,
          );
        }
        console.log('');
        return;
      }

      case 'training': {
        const status = options?.status as EvaluationOverallStatus | undefined;
        const rating = options?.rating ? parseInt(options.rating, 10) : undefined;
        const category = options?.category as FailureCategory | undefined;

        const candidates = context.feedbackService.queryTrainingCandidates({
          projectId: context.projectId,
          verificationStatus: status === 'verified' || status === 'verified_with_limitations' || status === 'failed' ? status : undefined,
          minRating: rating,
          failureCategories: category ? [category] : undefined,
        });

        console.log(`\n${Theme.icons.sparkle} TRAINING DATA CANDIDATES (${candidates.length} total)\n`);

        const sftList = candidates.filter((c) => c.pairType === 'sft_demonstration');
        const dpoRejected = candidates.filter((c) => c.pairType === 'dpo_rejected');

        console.log(`  ${Theme.icons.bullet} SFT Demonstrations (Verified + Clean): ${sftList.length}`);
        console.log(`  ${Theme.icons.bullet} DPO Contrast Pairs (Failed / Negative): ${dpoRejected.length}\n`);

        for (const c of candidates) {
          const badge = c.pairType === 'sft_demonstration' ? '[SFT ELIGIBLE]' : '[DPO REJECTED]';
          console.log(
            `  ${badge} Eval: ${c.evaluationId.slice(0, 16)} | Session: ${c.sessionId.slice(0, 12)} | Success: ${c.isSuccessful ? 'Yes' : 'No'}`,
          );
          if (c.critique) {
            console.log(`    Critique: ${c.critique.slice(0, 80)}`);
          }
        }
        console.log('');
        return;
      }

      case 'list':
      case 'history':
      default: {
        const evaluations = context.feedbackService.listEvaluations(context.projectId);
        console.log(`\n${Theme.icons.sparkle} TASK EVALUATION HISTORY\n`);

        if (evaluations.length === 0) {
          console.log(`  ${Theme.icons.bulletOpen} No task evaluations recorded yet.\n`);
          return;
        }

        for (const e of evaluations) {
          const statusIcon =
            e.overallStatus === 'verified'
              ? Theme.icons.check
              : e.overallStatus === 'failed'
                ? Theme.icons.cross
                : Theme.icons.bulletOpen;
          console.log(
            `  ${statusIcon} [${e.id.slice(0, 12)}] Task: ${e.taskId ?? 'N/A'} | Status: ${e.overallStatus} | Coverage: ${e.requirementCoverage} | Training: ${e.trainingEligible ? 'Eligible' : 'No'}`,
          );
          if (e.failures.length > 0) {
            console.log(`    Issues: ${e.failures.map((f: { category: string }) => f.category).join(', ')}`);
          }
        }
        console.log(`\nUse 'evolve evaluate inspect <id>' for full report breakdown.\n`);
        return;
      }
    }
  } finally {
    context.close();
  }
}
