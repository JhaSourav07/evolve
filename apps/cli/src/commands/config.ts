import { CliContext } from '../context.js';
import { Theme } from '../components/Theme.js';

export async function runConfigCommand(): Promise<void> {
  const context = new CliContext();

  console.log(`\n${Theme.icons.sparkle} EVOLVE CONFIGURATION\n`);
  console.log(`  Model:`);
  console.log(`    Provider:     ${context.config.model.provider}`);
  console.log(`    Model:        ${context.config.model.model}`);
  console.log(`    Base URL:     ${context.config.model.baseUrl}`);
  console.log(`    Temperature:  ${context.config.model.temperature}`);
  console.log(`    Timeout:      ${context.config.model.timeoutMs}ms`);

  console.log(`\n  Workspace:`);
  console.log(`    Root Dir:     ${context.config.workspace.rootDir}`);
  console.log(`    Max File:     ${context.config.workspace.maxFileSizeKb} KB`);
  console.log(`    Ignored:      ${context.config.workspace.ignoredPatterns.join(', ')}`);

  console.log(`\n  Security:`);
  console.log(
    `    Shell Exec:   ${context.config.security.allowShellExecution ? 'Allowed' : 'Blocked'}`,
  );
  console.log(
    `    Approval:     ${context.config.security.requireApprovalForCommands ? 'Required' : 'Disabled'}`,
  );
  console.log(`    Timeout:      ${context.config.security.commandTimeoutMs}ms`);

  console.log(`\n  Storage:`);
  console.log(`    Database:     ${context.config.storage.dbPath}`);
  console.log(`    WAL Mode:     ${context.config.storage.enableWal ? 'Enabled' : 'Disabled'}`);
  console.log(`    Max Steps:    ${context.config.maxStepsPerSession}`);
  console.log('');

  context.close();
}
