import { execSync } from 'node:child_process';
import React from 'react';
import { render } from 'ink';
import { StatusCard } from '../components/StatusCard.js';
import { CliContext } from '../context.js';

export async function runStatusCommand(): Promise<void> {
  const context = new CliContext();

  let gitBranch: string | undefined;
  let gitClean = true;
  try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: context.rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const diff = execSync('git status --porcelain', {
      cwd: context.rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    gitClean = diff.length === 0;
  } catch {
    // Not a git repo
  }

  const health = await context.provider.checkHealth();
  const sessions = context.sessionRepo.listByProject(context.projectId);
  const memories = context.memoryService.search('', { projectId: context.projectId, limit: 100 });

  const statusData = {
    projectName: context.rootDir.split('/').pop() || 'Evolve Project',
    projectId: context.projectId,
    rootDir: context.rootDir,
    gitBranch,
    gitClean,
    provider: context.config.model.provider,
    model: context.config.model.model,
    isOnline: health.isHealthy,
    sessionId: sessions[0]?.id ?? 'None',
    sessionCount: sessions.length,
    memoryCount: memories.length,
    integrations: {
      terminal: context.consentManager.hasConsent('terminal'),
      vscode: context.consentManager.hasConsent('vscode'),
      pi: context.consentManager.hasConsent('pi'),
      claude: context.consentManager.hasConsent('claude_import'),
      gemini: context.consentManager.hasConsent('gemini_import'),
    },
    dbPath: `${context.rootDir}/.evolve/evolve.db`,
  };

  const app = render(React.createElement(StatusCard, { status: statusData }), {
    patchConsole: false,
  });
  app.unmount();
  context.close();
}
