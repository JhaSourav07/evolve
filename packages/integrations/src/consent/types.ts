export type IntegrationSource =
  'evolve_native' | 'terminal' | 'vscode' | 'pi' | 'claude_import' | 'gemini_import';

export type ConsentScope =
  'workspace_only' | 'session_only' | 'explicit_command' | 'explicit_file_import';

export interface SourceAttribution {
  source: IntegrationSource;
  originalId?: string | undefined;
  importedAt: number;
  consentGranted: boolean;
  consentScope: ConsentScope;
  metadata?: Record<string, unknown> | undefined;
}

export interface ConsentPolicy {
  allowTerminalCollection?: boolean | undefined;
  allowVSCodeCollection?: boolean | undefined;
  allowPiCollection?: boolean | undefined;
  allowClaudeImport?: boolean | undefined;
  allowGeminiImport?: boolean | undefined;
  allowedWorkspaceRoots?: string[] | undefined;
}
