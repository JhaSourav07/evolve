import { SecurityError } from '@evolve/core';
import type { ConsentPolicy, ConsentScope, IntegrationSource, SourceAttribution } from './types.js';

export class ConsentManager {
  private readonly consents = new Map<IntegrationSource, SourceAttribution>();
  private readonly policy: ConsentPolicy;

  constructor(policy: ConsentPolicy = {}) {
    this.policy = {
      allowTerminalCollection: policy.allowTerminalCollection ?? false,
      allowVSCodeCollection: policy.allowVSCodeCollection ?? false,
      allowPiCollection: policy.allowPiCollection ?? false,
      allowClaudeImport: policy.allowClaudeImport ?? false,
      allowGeminiImport: policy.allowGeminiImport ?? false,
      allowedWorkspaceRoots: policy.allowedWorkspaceRoots ?? [],
    };

    // evolve_native is always consented within the agent runtime
    this.grantConsent('evolve_native', 'workspace_only', {
      policy: 'native_execution',
    });

    if (this.policy.allowTerminalCollection) {
      this.grantConsent('terminal', 'explicit_command');
    }
    if (this.policy.allowVSCodeCollection) {
      this.grantConsent('vscode', 'workspace_only');
    }
    if (this.policy.allowPiCollection) {
      this.grantConsent('pi', 'session_only');
    }
    if (this.policy.allowClaudeImport) {
      this.grantConsent('claude_import', 'explicit_file_import');
    }
    if (this.policy.allowGeminiImport) {
      this.grantConsent('gemini_import', 'explicit_file_import');
    }
  }

  public grantConsent(
    source: IntegrationSource,
    scope: ConsentScope,
    metadata?: Record<string, unknown>,
  ): SourceAttribution {
    const attribution: SourceAttribution = {
      source,
      consentGranted: true,
      consentScope: scope,
      importedAt: Date.now(),
      ...(metadata ? { metadata } : {}),
    };
    this.consents.set(source, attribution);
    return attribution;
  }

  public revokeConsent(source: IntegrationSource): void {
    if (source === 'evolve_native') {
      return; // Native execution cannot be revoked without stopping runtime
    }
    this.consents.delete(source);
  }

  public hasConsent(source: IntegrationSource): boolean {
    return this.consents.has(source);
  }

  public assertConsent(
    source: IntegrationSource,
    scope?: ConsentScope,
    originalId?: string,
  ): SourceAttribution {
    const existing = this.consents.get(source);
    if (!existing || !existing.consentGranted) {
      throw new SecurityError(
        `Interaction collection rejected: missing explicit user consent for source "${source}". ` +
          `Evolve strictly prohibits capturing user activity or importing external data without explicit authorization.`,
      );
    }

    return {
      source,
      ...(originalId ? { originalId } : {}),
      importedAt: Date.now(),
      consentGranted: true,
      consentScope: scope ?? existing.consentScope,
      ...(existing.metadata ? { metadata: existing.metadata } : {}),
    };
  }

  public validateWorkspace(cwd: string, workspaceRoot?: string): void {
    const root = workspaceRoot ?? this.policy.allowedWorkspaceRoots?.[0];
    if (!root) {
      return;
    }

    const normalizedCwd = cwd.replace(/\\/g, '/');
    const normalizedRoot = root.replace(/\\/g, '/');

    if (!normalizedCwd.startsWith(normalizedRoot)) {
      throw new SecurityError(
        `Interaction collection rejected: activity at "${cwd}" is outside the authorized project root "${root}". ` +
          `Evolve will not collect commands or editor activity outside approved project boundaries.`,
      );
    }
  }
}
