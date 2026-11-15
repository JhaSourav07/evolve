import { describe, expect, it } from 'vitest';
import { SecurityError } from '@evolve/core';
import { ConsentManager } from './manager.js';

describe('ConsentManager', () => {
  it('grants native consent by default while rejecting external sources without consent', () => {
    const manager = new ConsentManager();
    expect(manager.hasConsent('evolve_native')).toBe(true);
    expect(manager.hasConsent('terminal')).toBe(false);
    expect(manager.hasConsent('vscode')).toBe(false);
    expect(manager.hasConsent('claude_import')).toBe(false);

    expect(() => manager.assertConsent('terminal')).toThrow(SecurityError);
  });

  it('allows explicit consent grant and produces valid source attribution', () => {
    const manager = new ConsentManager();
    const attribution = manager.grantConsent('terminal', 'explicit_command', {
      user: 'dev',
    });

    expect(attribution.source).toBe('terminal');
    expect(attribution.consentGranted).toBe(true);
    expect(attribution.consentScope).toBe('explicit_command');
    expect(manager.hasConsent('terminal')).toBe(true);

    const verified = manager.assertConsent('terminal', 'explicit_command', 'cmd_123');
    expect(verified.source).toBe('terminal');
    expect(verified.originalId).toBe('cmd_123');
  });

  it('revokes consent properly', () => {
    const manager = new ConsentManager();
    manager.grantConsent('vscode', 'workspace_only');
    expect(manager.hasConsent('vscode')).toBe(true);

    manager.revokeConsent('vscode');
    expect(manager.hasConsent('vscode')).toBe(false);
    expect(() => manager.assertConsent('vscode')).toThrow(SecurityError);
  });

  it('validates workspace boundaries and rejects out-of-boundary paths', () => {
    const manager = new ConsentManager({
      allowedWorkspaceRoots: ['/projects/evolve'],
    });

    expect(() => manager.validateWorkspace('/projects/evolve/src')).not.toThrow();
    expect(() => manager.validateWorkspace('/etc/shadow')).toThrow(SecurityError);
    expect(() => manager.validateWorkspace('/projects/other-repo')).toThrow(SecurityError);
  });
});
