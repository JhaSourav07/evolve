import { describe, expect, it } from 'vitest';
import { SecurityError } from '@evolve/core';
import { ConsentManager } from '../consent/manager.js';
import { PiAdapter } from './adapter.js';

describe('PiAdapter', () => {
  it('enforces consent policy for Pi session capture', () => {
    const consent = new ConsentManager();
    const adapter = new PiAdapter(consent);

    expect(() =>
      adapter.handleUserMessage('sess_pi_1', {
        id: 'msg_1',
        role: 'user',
        text: 'Hello Pi',
      }),
    ).toThrow(SecurityError);
  });

  it('normalizes Pi agent interactive streams and tools into canonical Evolve events', () => {
    const consent = new ConsentManager({ allowPiCollection: true });
    const adapter = new PiAdapter(consent);

    const startEv = adapter.handleSessionStart({
      sessionId: 'sess_pi_1',
      title: 'Analyze performance regression',
    });
    expect(startEv.type).toBe('session_started');
    expect(startEv.attribution.source).toBe('pi');

    const userEv = adapter.handleUserMessage('sess_pi_1', {
      id: 'pi_u1',
      role: 'user',
      text: 'Why is the bundle size so high?',
    });
    expect(userEv.type).toBe('user_prompt');
    expect(userEv.payload.prompt).toBe('Why is the bundle size so high?');
    expect(userEv.attribution.originalId).toBe('pi_u1');

    const callEv = adapter.handleToolCall('sess_pi_1', {
      callId: 'pi_call_99',
      name: 'analyze_bundle',
      args: { statsFile: 'stats.json' },
    });
    expect(callEv.type).toBe('tool_call');
    expect(callEv.payload.toolName).toBe('analyze_bundle');

    const resEv = adapter.handleToolResult('sess_pi_1', {
      callId: 'pi_call_99',
      name: 'analyze_bundle',
      success: true,
      result: 'Found duplicate lodash modules',
    });
    expect(resEv.type).toBe('tool_result');
    expect(resEv.payload.output).toBe('Found duplicate lodash modules');

    const asstEv = adapter.handleAssistantMessage('sess_pi_1', {
      id: 'pi_a1',
      role: 'assistant',
      text: 'The bundle contains two different lodash versions.',
      model: 'pi-coder',
    });
    expect(asstEv.type).toBe('assistant_response');

    const fbEv = adapter.handleFeedback('sess_pi_1', {
      feedbackId: 'pi_fb_1',
      value: 'up',
      text: 'Accurate analysis',
    });
    expect(fbEv.type).toBe('human_feedback');
    expect(fbEv.payload.rating).toBe(1);
  });
});
