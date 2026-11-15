import { CliContext } from '../context.js';
import { Theme } from '../components/Theme.js';

export async function runFeedbackCommand(options?: {
  rating?: string;
  notes?: string;
  correction?: string;
}): Promise<void> {
  const context = new CliContext();

  if (options?.rating !== undefined) {
    const numericRating = parseInt(options.rating, 10);
    const sessions = context.sessionRepo.listByProject(context.projectId);
    const latestSession = sessions[0];

    if (!latestSession) {
      console.error(`\n${Theme.icons.cross} No sessions found to attach feedback to.\n`);
      context.close();
      return;
    }

    const record = context.feedbackService.record({
      sessionId: latestSession.id,
      targetType: 'response',
      rating: isNaN(numericRating) ? 1 : numericRating,
      type: 'human',
      notes: options.notes,
      correction: options.correction,
      isTechnicallyCorrect: numericRating === 1,
    });

    console.log(`\n${Theme.icons.check} Feedback recorded for session "${latestSession.id}":`);
    console.log(`  Rating: ${record.rating}`);
    if (record.notes) console.log(`  Notes: "${record.notes}"`);
    if (record.correction) console.log(`  Correction: "${record.correction}"`);
    console.log('');
    context.close();
    return;
  }

  // Display recent feedback
  const sessions = context.sessionRepo.listByProject(context.projectId);
  console.log(`\n${Theme.icons.sparkle} INTERACTION FEEDBACK HISTORY\n`);

  let count = 0;
  for (const s of sessions) {
    const fbList = context.feedbackService.listBySession(s.id);
    for (const fb of fbList) {
      count++;
      const ratingLabel =
        fb.rating === 1 ? 'Correct (+1)' : fb.rating === 0 ? 'Partial (0)' : 'Incorrect (-1)';
      console.log(`  ${Theme.icons.bullet} Session: ${s.id} (${s.goal})`);
      console.log(
        `    Rating: ${ratingLabel} • Verified: ${fb.isTechnicallyCorrect ? 'Yes' : 'No'}`,
      );
      if (fb.notes) console.log(`    Notes: "${fb.notes}"`);
      if (fb.correction) console.log(`    Correction: "${fb.correction}"`);
      console.log('');
    }
  }

  if (count === 0) {
    console.log(
      `  ${Theme.icons.bulletOpen} No feedback recorded yet. Use /feedback during interactive chat.\n`,
    );
  }

  context.close();
}
