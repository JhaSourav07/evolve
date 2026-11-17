import type { ActionRating, TaskRatings } from '@evolve/core';
import { CliContext } from '../context.js';
import { Theme } from '../components/Theme.js';

export interface FeedbackCommandOptions {
  subcommand?: string | undefined;
  args?: string[] | undefined;
  rating?: string | undefined;
  actionType?: string | undefined;
  taskRatings?: string | undefined; // "5,4,5,5,5"
  notes?: string | undefined;
  correction?: string | undefined;
}

export async function runFeedbackCommand(options?: FeedbackCommandOptions): Promise<void> {
  const context = new CliContext();
  const subcommand = options?.subcommand?.toLowerCase() || (options?.rating !== undefined ? 'response' : 'list');
  const args = options?.args || [];

  try {
    switch (subcommand) {
      case 'response': {
        const ratingStr = options?.rating ?? args[0];
        if (ratingStr === undefined) {
          console.log(`\nUsage: evolve feedback response <1|0|-1> [--notes <text>] [--correction <code>]\n`);
          return;
        }

        const numericRating = parseInt(ratingStr, 10);
        const sessions = context.sessionRepo.listByProject(context.projectId);
        const latestSession = sessions[0];

        if (!latestSession) {
          console.error(`\n${Theme.icons.cross} No active sessions found to attach response feedback to.\n`);
          return;
        }

        const record = context.feedbackService.recordResponseFeedback({
          sessionId: latestSession.id,
          rating: isNaN(numericRating) ? 1 : numericRating,
          notes: options?.notes,
          correction: options?.correction,
        });

        console.log(`\n${Theme.icons.check} Response feedback recorded for session "${latestSession.id}":`);
        console.log(`  Rating: ${record.rating === 1 ? 'Correct (+1)' : record.rating === 0 ? 'Partial (0)' : 'Incorrect (-1)'}`);
        if (record.notes) console.log(`  Notes: "${record.notes}"`);
        if (record.correction) console.log(`  Correction: "${record.correction}"`);
        console.log('');
        return;
      }

      case 'action': {
        const toolCallId = args[0];
        const actionRating = (options?.actionType ?? args[1]) as ActionRating | undefined;

        if (!toolCallId || !actionRating) {
          console.log(`\nUsage: evolve feedback action <toolCallId> <correct_tool_selection|incorrect_tool_selection|successful_action|failed_action|unnecessary_action|unsafe_action> [--notes <text>] [--correction <code>]\n`);
          return;
        }

        const sessions = context.sessionRepo.listByProject(context.projectId);
        const latestSession = sessions[0];
        if (!latestSession) {
          console.error(`\n${Theme.icons.cross} No sessions found.\n`);
          return;
        }

        const record = context.feedbackService.recordActionFeedback({
          sessionId: latestSession.id,
          toolCallId,
          actionRating,
          notes: options?.notes,
          correction: options?.correction,
        });

        console.log(`\n${Theme.icons.check} Action feedback recorded:`);
        console.log(`  Tool Call: ${toolCallId}`);
        console.log(`  Action Rating: ${record.ratingLabel}`);
        console.log(`  Numeric Score: ${record.rating}`);
        if (record.notes) console.log(`  Notes: "${record.notes}"`);
        if (record.correction) console.log(`  Correction: "${record.correction}"`);
        console.log('');
        return;
      }

      case 'task': {
        const taskId = args[0];
        if (!taskId) {
          console.log(`\nUsage: evolve feedback task <taskId> [--ratings 5,5,5,5,5] [--notes <text>] [--correction <code>]\n`);
          return;
        }

        const sessions = context.sessionRepo.listByProject(context.projectId);
        const latestSession = sessions[0];
        if (!latestSession) {
          console.error(`\n${Theme.icons.cross} No sessions found.\n`);
          return;
        }

        let reqSat = 5;
        let codeQual = 5;
        let arch = 5;
        let corr = 5;
        let comp = 5;

        if (options?.taskRatings) {
          const parts = options.taskRatings.split(',').map((p) => parseInt(p.trim(), 10));
          if (parts.length >= 5) {
            reqSat = parts[0] ?? 5;
            codeQual = parts[1] ?? 5;
            arch = parts[2] ?? 5;
            corr = parts[3] ?? 5;
            comp = parts[4] ?? 5;
          }
        }

        const ratings: TaskRatings = {
          requirementSatisfaction: reqSat,
          codeQuality: codeQual,
          architecture: arch,
          correctness: corr,
          completeness: comp,
          overallRating: Math.round((reqSat + codeQual + arch + corr + comp) / 5),
        };

        const record = context.feedbackService.recordTaskFeedback({
          sessionId: latestSession.id,
          taskId,
          ratings,
          notes: options?.notes,
          correction: options?.correction,
        });

        console.log(`\n${Theme.icons.check} Task-level feedback recorded for task "${taskId}":`);
        console.log(`  Requirement Satisfaction: ${ratings.requirementSatisfaction}/5`);
        console.log(`  Code Quality: ${ratings.codeQuality}/5`);
        console.log(`  Architecture: ${ratings.architecture}/5`);
        console.log(`  Correctness: ${ratings.correctness}/5`);
        console.log(`  Completeness: ${ratings.completeness}/5`);
        console.log(`  Overall: ${ratings.overallRating}/5 (rating score: ${record.rating})`);
        if (record.notes) console.log(`  Notes: "${record.notes}"`);
        if (record.correction) console.log(`  Correction: "${record.correction}"`);
        console.log('');
        return;
      }

      case 'list':
      case 'history':
      default: {
        const sessions = context.sessionRepo.listByProject(context.projectId);
        console.log(`\n${Theme.icons.sparkle} INTERACTION FEEDBACK HISTORY\n`);

        let count = 0;
        for (const s of sessions) {
          const fbList = context.feedbackService.listBySession(s.id);
          for (const fb of fbList) {
            count++;
            const level = fb.feedbackLevel ?? 'response';
            const ratingLabel =
              fb.rating === 1 ? 'Correct (+1)' : fb.rating === 0 ? 'Partial (0)' : 'Incorrect (-1)';
            console.log(`  ${Theme.icons.bullet} [${level.toUpperCase()}] Session: ${s.id} (${s.goal})`);
            console.log(
              `    Rating: ${ratingLabel} • Target: ${fb.targetId ?? fb.targetType} • Level: ${level}`,
            );
            if (fb.ratingLabel) console.log(`    Rating Label: ${fb.ratingLabel}`);
            if (fb.notes) console.log(`    Notes: "${fb.notes}"`);
            if (fb.correction) console.log(`    Correction: "${fb.correction}"`);
            console.log('');
          }
        }

        if (count === 0) {
          console.log(
            `  ${Theme.icons.bulletOpen} No feedback recorded yet. Use /feedback during interactive chat or 'evolve feedback response|action|task'.\n`,
          );
        }
        return;
      }
    }
  } finally {
    context.close();
  }
}
