import React from 'react';
import { render } from 'ink';
import { HistoryList } from '../components/HistoryList.js';
import { CliContext } from '../context.js';

export async function runHistoryCommand(): Promise<void> {
  const context = new CliContext();
  const rawSessions = context.sessionRepo.listByProject(context.projectId);

  const sessions = rawSessions.map((s) => ({
    id: s.id,
    goal: s.goal,
    status: s.status,
    createdAt: s.createdAt,
  }));

  const app = render(React.createElement(HistoryList, { sessions }), {
    patchConsole: false,
  });
  app.unmount();
  context.close();
}
