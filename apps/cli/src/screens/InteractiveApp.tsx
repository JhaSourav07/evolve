import React, { useEffect, useRef, useState } from 'react';
import { Box, useApp } from 'ink';
import type { EventEnvelope, ToolApprovalRequest } from '@evolve/core';
import type { AgentRuntime } from '@evolve/agent';
import { Header } from '../components/Header.js';
import { HistoryList, type SessionSummary } from '../components/HistoryList.js';
import { InputBox } from '../components/InputBox.js';
import { IntegrationsList, type IntegrationStatusItem } from '../components/IntegrationsList.js';
import { MemoryList, type MemoryEntry } from '../components/MemoryList.js';
import { MessageItem, type ChatMessage } from '../components/MessageItem.js';
import { ModelSelectPrompt, type ModelOption } from '../components/ModelSelectPrompt.js';
import { ModelsList } from '../components/ModelsList.js';
import { StatusCard, type StatusData } from '../components/StatusCard.js';
import { ToolApprovalPrompt } from '../components/ToolApprovalPrompt.js';
import { FeedbackPrompt } from '../components/FeedbackPrompt.js';
import { PlanCard } from '../components/PlanCard.js';
import { PlanHistoryList } from '../components/PlanHistoryList.js';
import type { Plan, PlanId } from '@evolve/core';
import type { CliContext } from '../context.js';

export interface InteractiveAppProps {
  context: CliContext;
  initialPrompt?: string | undefined;
  initialModel?: string | undefined;
  initialScreen?:
    | ('chat' | 'status' | 'history' | 'memory' | 'integrations' | 'models' | 'model_select' | 'plan' | 'plan_history')
    | undefined;
  initialPlanId?: string | undefined;
}

export const InteractiveApp: React.FC<InteractiveAppProps> = ({
  context,
  initialPrompt,
  initialModel,
  initialScreen,
  initialPlanId,
}) => {
  const { exit } = useApp();

  // Active Ollama model name
  const [activeModel, setActiveModel] = useState<string>(initialModel || context.getModel());

  // Determine initial screen: if user provided prompt or explicit model, start in chat; otherwise scan & select
  const [screen, setScreen] = useState<string>(() => {
    if (initialPlanId) return 'plan';
    if (initialScreen) return initialScreen;
    if (initialModel || initialPrompt) return 'chat';
    return 'model_select';
  });

  const [activePlan, setActivePlan] = useState<Plan | null>(() => {
    if (initialPlanId) {
      return context.planner.getPlan(initialPlanId as PlanId) ?? null;
    }
    return null;
  });
  const [plansHistoryList, setPlansHistoryList] = useState<readonly Plan[]>([]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content: 'Evolve interactive session initialized. Type your request or /help for commands.',
      timestamp: Date.now(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [sessionId, setSessionId] = useState(() => context.createSession());
  const [gitBranch, setGitBranch] = useState<string | undefined>(undefined);
  const [gitClean, setGitClean] = useState(true);

  // Approval prompt state
  const [pendingApproval, setPendingApproval] = useState<{
    toolName: string;
    parameters: Record<string, unknown>;
    resolve: (approved: boolean) => void;
  } | null>(null);

  // Feedback prompt state
  const [showFeedback, setShowFeedback] = useState(false);

  // Abort controller ref for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Persistent runtime ref for multi-turn conversation memory
  const runtimeRef = useRef<AgentRuntime | null>(null);

  // Collapsible thinking state (toggled via Ctrl+O or /thinking)
  const [isThinkingExpanded, setIsThinkingExpanded] = useState<boolean>(false);

  // Discovered models list
  const [modelsList, setModelsList] = useState<ModelOption[]>([]);

  // Data for secondary screens
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [historySessions, setHistorySessions] = useState<SessionSummary[]>([]);
  const [memoriesList, setMemoriesList] = useState<MemoryEntry[]>([]);

  // Function to scan and discover Ollama models
  const scanModelsAndHealth = async (): Promise<ModelOption[]> => {
    const health = await context.provider.checkHealth();
    setIsOnline(health.isHealthy);

    try {
      const discovered = await context.discoverModels();
      const options: ModelOption[] = discovered.map((m) => ({
        name: m.name,
        size: m.size ? `${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB` : undefined,
        parameterSize: m.parameterSize,
        quantizationLevel: m.quantizationLevel,
      }));
      setModelsList(options);
      return options;
    } catch {
      setModelsList([]);
      return [];
    }
  };

  // Check health, discover models, and verify git on startup
  useEffect(() => {
    let mounted = true;

    async function init() {
      const options = await scanModelsAndHealth();

      // Check git status
      try {
        const { execSync } = await import('node:child_process');
        const branch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: context.rootDir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        const diff = execSync('git status --porcelain', {
          cwd: context.rootDir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (mounted) {
          setGitBranch(branch || undefined);
          setGitClean(diff.length === 0);
        }
      } catch {
        // Not a git repo
      }

      if (!mounted) return;

      const modelExists = options.some((m) => m.name === activeModel);
      if (!modelExists && options.length > 0) {
        // If the configured model does not exist locally and we're not waiting for user selection
        if (screen !== 'model_select') {
          const preferred =
            options.find((m) => m.name.toLowerCase().includes('coder')) ||
            options.find((m) => m.name.toLowerCase().includes('qwen')) ||
            options[0];
          if (preferred) {
            context.setModel(preferred.name);
            setActiveModel(preferred.name);
          }
        }
      }

      // If initialPrompt provided, execute it immediately with the effective model
      if (initialPrompt && initialPrompt.trim()) {
        setScreen('chat');
        handleUserPrompt(initialPrompt.trim());
      } else if (!initialModel && options.length > 0 && screen === 'model_select') {
        // Stay on model_select to let user choose
        setScreen('model_select');
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const selectModelAndStart = (modelName: string) => {
    context.setModel(modelName);
    setActiveModel(modelName);
    // Reset runtime so next prompt uses the new model
    runtimeRef.current = null;
    const newSid = context.createSession();
    setSessionId(newSid);
    setMessages((prev) => [
      ...prev,
      {
        id: `sys_${Date.now()}`,
        role: 'system',
        content: `Active model set to: ${modelName}. Ready for your requests.`,
        timestamp: Date.now(),
      },
    ]);
    setScreen('chat');

    if (initialPrompt && initialPrompt.trim()) {
      handleUserPrompt(initialPrompt.trim());
    }
  };

  const handleUserPrompt = async (promptText: string) => {
    // 1. Handle Slash Commands
    if (promptText.startsWith('/')) {
      handleSlashCommand(promptText);
      return;
    }

    // 2. Add user message to UI
    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: promptText,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setScreen('chat');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // 3. Obtain or initialize AgentRuntime (preserves multi-turn conversation)
      if (!runtimeRef.current) {
        runtimeRef.current = context.createAgentRuntime(
          sessionId,
          async (req: ToolApprovalRequest) => {
            return new Promise<boolean>((resolve) => {
              setPendingApproval({
                toolName: req.toolName,
                parameters: req.params,
                resolve: (approved: boolean) => {
                  setPendingApproval(null);
                  resolve(approved);
                },
              });
            });
          },
        );
      }

      const runtime = runtimeRef.current;

      // Listen for runtime events to display tool actions and streaming responses
      const unsub = runtime.onAny((event: EventEnvelope) => {
        if (event.type === 'tool_call') {
          const payload = event.payload as { toolName: string; arguments: Record<string, unknown> };
          setMessages((prev) => [
            ...prev,
            {
              id: `tc_${Date.now()}`,
              role: 'tool_call',
              content: '',
              toolName: payload.toolName,
              toolArgs: payload.arguments,
              timestamp: Date.now(),
            },
          ]);
        } else if (event.type === 'tool_result') {
          const payload = event.payload as {
            toolName: string;
            output?: string;
            error?: string;
            success: boolean;
          };
          setMessages((prev) => [
            ...prev,
            {
              id: `tr_${Date.now()}`,
              role: 'tool_result',
              content: payload.output ?? payload.error ?? '',
              toolName: payload.toolName,
              toolSuccess: payload.success,
              timestamp: Date.now(),
            },
          ]);
        }
      });

      // 4. Run Agent Loop
      const result = await runtime.run(promptText, {
        signal: abortController.signal,
        sessionId,
      });

      unsub();

      // 5. Add response to UI (Strictly avoid echoing user prompt on error)
      if (!result.success) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'error',
            content: result.error || 'Agent execution failed without model response.',
            recoveryHint:
              'Verify that Ollama is running (`ollama serve`) and the model is loaded (`ollama ps`). You can switch models with /model.',
            timestamp: Date.now(),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `asst_${Date.now()}`,
            role: 'assistant',
            content: result.finalResponse || 'Task completed.',
            ...(result.thinking ? { thinking: result.thinking } : {}),
            timestamp: Date.now(),
          },
        ]);
      }
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      const isAbort = errMessage.includes('abort') || abortController.signal.aborted;

      const recovery = isAbort
        ? undefined
        : `Check that Ollama is running and model "${activeModel}" is available. Use /model to switch.`;

      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: isAbort ? 'system' : 'error',
          content: isAbort ? 'Operation cancelled by user.' : errMessage,
          ...(recovery ? { recoveryHint: recovery } : {}),
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleApprovePlan = async (pId: string) => {
    try {
      const approved = await context.planner.approvePlan(pId as PlanId);
      setActivePlan(approved);
      setMessages((prev) => [
        ...prev,
        {
          id: `plan_app_${Date.now()}`,
          role: 'system',
          content: `Plan ${pId} has been APPROVED. Ready for execution in Phase 3.`,
          timestamp: Date.now(),
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'error',
          content: `Failed to approve plan ${pId}: ${msg}`,
          timestamp: Date.now(),
        },
      ]);
    }
  };

  const handleRejectPlan = async (pId: string, reason?: string) => {
    try {
      const rejected = await context.planner.rejectPlan(pId as PlanId, reason);
      setActivePlan(rejected);
      setMessages((prev) => [
        ...prev,
        {
          id: `plan_rej_${Date.now()}`,
          role: 'system',
          content: `Plan ${pId} has been REJECTED.${reason ? ` Reason: "${reason}"` : ''}`,
          timestamp: Date.now(),
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'error',
          content: `Failed to reject plan ${pId}: ${msg}`,
          timestamp: Date.now(),
        },
      ]);
    }
  };

  const handleRegeneratePlan = async (pId: string) => {
    setIsLoading(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `plan_regen_${Date.now()}`,
        role: 'system',
        content: `Regenerating plan ${pId} with updated repository analysis...`,
        timestamp: Date.now(),
      },
    ]);

    try {
      const regenerated = await context.planner.regeneratePlan(pId as PlanId);
      setActivePlan(regenerated);
      setScreen('plan');
      setMessages((prev) => [
        ...prev,
        {
          id: `plan_regen_ok_${Date.now()}`,
          role: 'system',
          content: `Plan regenerated successfully (Revision ${regenerated.revision}, ${regenerated.tasks.length} tasks).`,
          timestamp: Date.now(),
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'error',
          content: `Failed to regenerate plan ${pId}: ${msg}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePlan = async (promptText: string, mode: 'quick' | 'detailed' = 'detailed') => {
    setIsLoading(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `usr_${Date.now()}`,
        role: 'user',
        content: `/plan ${mode === 'quick' ? 'quick ' : ''}${promptText}`,
        timestamp: Date.now(),
      },
      {
        id: `plan_gen_${Date.now()}`,
        role: 'system',
        content: `Analyzing repository intelligence and generating ${mode} implementation plan...`,
        timestamp: Date.now(),
      },
    ]);

    try {
      const plan = await context.planner.createPlan({
        userPrompt: promptText,
        sessionId,
        mode,
      });

      setActivePlan(plan);
      setScreen('plan');
      setMessages((prev) => [
        ...prev,
        {
          id: `plan_ok_${Date.now()}`,
          role: 'system',
          content: `Plan generated: "${plan.title}" (${plan.tasks.length} tasks, complexity: ${plan.estimatedComplexity}, risk: ${plan.risks.overallRisk}). Review and approve below.`,
          timestamp: Date.now(),
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'error',
          content: `Failed to generate plan: ${msg}`,
          recoveryHint: 'Ensure Ollama is running and has sufficient context window.',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSlashCommand = async (cmdText: string) => {
    const parts = cmdText.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const arg = parts.slice(1).join(' ').trim();

    switch (cmd) {
      case '/help':
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            role: 'system',
            content: [
              'Evolve CLI Commands:',
              '  /chat            - Return to active chat view',
              '  /plan [req]      - Generate repository-aware implementation plan (detailed)',
              '  /plan quick [r]  - Generate a concise implementation plan',
              '  /plan detailed   - Generate a comprehensive implementation plan',
              '  /plan history    - View previous plans generated for this project',
              '  /plan approve    - Approve active plan for execution in Phase 3',
              '  /plan reject     - Reject active plan with optional reason',
              '  /model [name/#]  - Select or switch active Ollama model',
              '  /details         - Toggle thinking & tool output details (Shortcut: Ctrl+O)',
              '  /status          - Show system and project status dashboard',
              '  /history         - View previous sessions',
              '  /memory          - View project conventions and stored experiences',
              '  /integrations    - View active integrations and consent governance',
              '  /models          - Discover and inspect local Ollama models',
              '  /feedback        - Rate the last agent interaction',
              '  /clear           - Clear screen messages',
              '  /new             - Start a new session',
              '  /exit or /quit   - Exit Evolve CLI',
            ].join('\n'),
            timestamp: Date.now(),
          },
        ]);
        break;

      case '/thinking':
      case '/think':
      case '/details':
      case '/output':
        setIsThinkingExpanded((prev) => {
          const next = !prev;
          setMessages((m) => [
            ...m,
            {
              id: `sys_${Date.now()}`,
              role: 'system',
              content: `Detailed output view (thinking & tool outputs) is now ${next ? 'EXPANDED' : 'COLLAPSED'}. (Shortcut: Ctrl+O)`,
              timestamp: Date.now(),
            },
          ]);
          return next;
        });
        break;

      case '/model':
      case '/models': {
        const models = await scanModelsAndHealth();
        if (arg.length > 0) {
          // If argument is a number 1..N
          const num = parseInt(arg, 10);
          if (!isNaN(num) && num >= 1 && num <= models.length) {
            const chosen = models[num - 1];
            if (chosen) {
              selectModelAndStart(chosen.name);
              return;
            }
          }
          // If argument is model name
          const matched = models.find(
            (m) =>
              m.name.toLowerCase() === arg.toLowerCase() ||
              m.name.toLowerCase().includes(arg.toLowerCase()),
          );
          if (matched) {
            selectModelAndStart(matched.name);
            return;
          }
        }
        // Otherwise switch to interactive model selection screen
        setScreen('model_select');
        break;
      }

      case '/clear':
        setMessages([]);
        setScreen('chat');
        break;

      case '/new': {
        const newSid = context.createSession();
        setSessionId(newSid);
        runtimeRef.current = null;
        setMessages([
          {
            id: `sys_${Date.now()}`,
            role: 'system',
            content: `New session started: ${newSid}`,
            timestamp: Date.now(),
          },
        ]);
        setScreen('chat');
        break;
      }

      case '/status':
        loadStatusData();
        setScreen('status');
        break;

      case '/history':
        loadHistoryData();
        setScreen('history');
        break;

      case '/memory':
        loadMemoryData();
        setScreen('memory');
        break;

      case '/integrations':
        setScreen('integrations');
        break;

      case '/feedback':
        setShowFeedback(true);
        break;

      case '/chat':
        setScreen('chat');
        break;

      case '/plan': {
        const subArg = arg.trim();
        if (!subArg) {
          if (activePlan) {
            setScreen('plan');
          } else {
            const plans = context.planner.listPlans(context.projectId);
            if (plans.length > 0) {
              setPlansHistoryList(plans);
              setActivePlan(plans[0] ?? null);
              setScreen('plan');
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  id: `sys_${Date.now()}`,
                  role: 'system',
                  content:
                    'No active plan. Usage:\n  /plan <objective>\n  /plan quick <objective>\n  /plan detailed <objective>\n  /plan history\n  /plan approve [planId]\n  /plan reject [planId]',
                  timestamp: Date.now(),
                },
              ]);
            }
          }
          break;
        }

        const firstToken = subArg.split(/\s+/)[0]?.toLowerCase();
        const remainder = subArg.slice(firstToken?.length ?? 0).trim();

        if (firstToken === 'history') {
          const plans = context.planner.listPlans(context.projectId);
          setPlansHistoryList(plans);
          setScreen('plan_history');
        } else if (firstToken === 'approve') {
          const targetId = remainder || activePlan?.planId;
          if (!targetId) {
            setMessages((prev) => [
              ...prev,
              {
                id: `err_${Date.now()}`,
                role: 'error',
                content: 'Specify plan ID to approve: /plan approve <planId>',
                timestamp: Date.now(),
              },
            ]);
          } else {
            await handleApprovePlan(targetId);
          }
        } else if (firstToken === 'reject') {
          const targetId = remainder.split(/\s+/)[0] || activePlan?.planId;
          const reason = remainder.slice(targetId?.length ?? 0).trim() || undefined;
          if (!targetId) {
            setMessages((prev) => [
              ...prev,
              {
                id: `err_${Date.now()}`,
                role: 'error',
                content: 'Specify plan ID to reject: /plan reject <planId> [reason]',
                timestamp: Date.now(),
              },
            ]);
          } else {
            await handleRejectPlan(targetId, reason);
          }
        } else if (firstToken === 'quick') {
          if (!remainder) {
            setMessages((prev) => [
              ...prev,
              {
                id: `err_${Date.now()}`,
                role: 'error',
                content: 'Please specify your objective: /plan quick <objective>',
                timestamp: Date.now(),
              },
            ]);
          } else {
            await handleCreatePlan(remainder, 'quick');
          }
        } else if (firstToken === 'detailed') {
          if (!remainder) {
            setMessages((prev) => [
              ...prev,
              {
                id: `err_${Date.now()}`,
                role: 'error',
                content: 'Please specify your objective: /plan detailed <objective>',
                timestamp: Date.now(),
              },
            ]);
          } else {
            await handleCreatePlan(remainder, 'detailed');
          }
        } else {
          // Default detailed mode with prompt
          await handleCreatePlan(subArg, 'detailed');
        }
        break;
      }

      case '/exit':
      case '/quit':
        context.close();
        exit();
        break;

      default:
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'error',
            content: `Unknown command: "${cmdText}". Type /help for available commands.`,
            timestamp: Date.now(),
          },
        ]);
        break;
    }
  };

  const loadStatusData = () => {
    const sessions = context.sessionRepo.listByProject(context.projectId);
    const memories = context.memoryService.search('', { projectId: context.projectId, limit: 100 });

    setStatusData({
      projectName: context.rootDir.split('/').pop() || 'Evolve Project',
      projectId: context.projectId,
      rootDir: context.rootDir,
      gitBranch: gitBranch ?? undefined,
      gitClean,
      provider: 'ollama',
      model: activeModel,
      isOnline,
      sessionId,
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
    });
  };

  const loadHistoryData = () => {
    const sessions = context.sessionRepo.listByProject(context.projectId);
    const summaries: SessionSummary[] = sessions.map((s) => ({
      id: s.id,
      goal: s.goal,
      status: s.status,
      createdAt: s.createdAt,
    }));
    setHistorySessions(summaries);
  };

  const loadMemoryData = () => {
    const memories = context.memoryService.search('', { projectId: context.projectId, limit: 50 });
    const entries: MemoryEntry[] = memories.map((m) => ({
      id: m.id,
      category: m.category,
      key: m.key,
      content: m.content,
    }));
    setMemoriesList(entries);
  };

  const handleFeedbackSubmit = (rating: number, notes?: string, correction?: string) => {
    setShowFeedback(false);
    try {
      context.feedbackService.record({
        sessionId,
        targetType: 'response',
        rating,
        type: 'human',
        ...(notes ? { notes } : {}),
        ...(correction ? { correction } : {}),
        isTechnicallyCorrect: rating === 1,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `fb_${Date.now()}`,
          role: 'system',
          content: `Feedback recorded: ${rating === 1 ? 'Correct (+1)' : rating === 0 ? 'Partially Correct (0)' : 'Incorrect (-1)'}${notes ? ` - "${notes}"` : ''}`,
          timestamp: Date.now(),
        },
      ]);
    } catch {
      // Feedback record error handled silently
    }
  };

  const integrationItems: IntegrationStatusItem[] = [
    {
      id: 'terminal',
      name: 'Terminal Integration',
      source: 'terminal',
      consentGranted: context.consentManager.hasConsent('terminal'),
      scope: 'explicit_command',
      description: 'Captures developer commands, outputs, and exit codes within project boundary.',
    },
    {
      id: 'vscode',
      name: 'VS Code Extension',
      source: 'vscode',
      consentGranted: context.consentManager.hasConsent('vscode'),
      scope: 'workspace_only',
      description: 'Captures editor chat prompts, code actions, and diff feedback.',
    },
    {
      id: 'pi',
      name: 'Pi Coding Agent',
      source: 'pi',
      consentGranted: context.consentManager.hasConsent('pi'),
      scope: 'session_only',
      description: 'Normalizes interactive streams and tool calls from Pi assistant.',
    },
    {
      id: 'claude',
      name: 'Claude Conversation Import',
      source: 'claude_import',
      consentGranted: context.consentManager.hasConsent('claude_import'),
      scope: 'explicit_file_import',
      description: 'Imports Anthropic Claude.ai conversation exports (conversations.json).',
    },
    {
      id: 'gemini',
      name: 'Gemini Conversation Import',
      source: 'gemini_import',
      consentGranted: context.consentManager.hasConsent('gemini_import'),
      scope: 'explicit_file_import',
      description: 'Imports Google AI Studio / Google Takeout conversation JSON archives.',
    },
  ];

  return (
    <Box flexDirection="column" padding={1}>
      <Header
        projectName={context.rootDir.split('/').pop() || 'Evolve Project'}
        model={activeModel}
        gitBranch={gitBranch}
        isOnline={isOnline}
        activeScreen={screen}
      />

      {/* Main Screen Content */}
      {screen === 'chat' && (
        <Box flexDirection="column">
          {messages.map((msg) => (
            <MessageItem key={msg.id} message={msg} isThinkingExpanded={isThinkingExpanded} />
          ))}
        </Box>
      )}

      {screen === 'model_select' && (
        <ModelSelectPrompt
          models={modelsList}
          isOnline={isOnline}
          providerUrl={context.config.model.baseUrl}
          currentModel={activeModel}
          onSelect={selectModelAndStart}
          onCancel={() => {
            if (messages.length > 1) {
              setScreen('chat');
            } else {
              exit();
            }
          }}
          onRetry={scanModelsAndHealth}
        />
      )}

      {screen === 'status' && statusData && <StatusCard status={statusData} />}

      {screen === 'history' && <HistoryList sessions={historySessions} />}

      {screen === 'memory' && <MemoryList memories={memoriesList} />}

      {screen === 'integrations' && <IntegrationsList items={integrationItems} />}

      {screen === 'models' && (
        <ModelsList
          models={modelsList.map((m) => ({
            name: m.name,
            size: m.size,
            isActive: m.name === activeModel,
          }))}
          isOnline={isOnline}
          providerUrl={context.config.model.baseUrl}
        />
      )}

      {screen === 'plan' && activePlan && (
        <PlanCard
          plan={activePlan}
          onApprove={(pId) => handleApprovePlan(pId)}
          onReject={(pId) => handleRejectPlan(pId)}
          onRegenerate={(pId) => handleRegeneratePlan(pId)}
          onClose={() => setScreen('chat')}
        />
      )}

      {screen === 'plan_history' && (
        <PlanHistoryList
          plans={plansHistoryList}
          onSelectPlan={(pId) => {
            const found = plansHistoryList.find((p) => p.planId === pId);
            if (found) {
              setActivePlan(found);
              setScreen('plan');
            }
          }}
          onClose={() => setScreen('chat')}
        />
      )}

      {/* Tool Approval Modal Prompt */}
      {pendingApproval && (
        <ToolApprovalPrompt
          toolName={pendingApproval.toolName}
          parameters={pendingApproval.parameters}
          onApprove={() => pendingApproval.resolve(true)}
          onReject={() => pendingApproval.resolve(false)}
          onCancel={() => pendingApproval.resolve(false)}
        />
      )}

      {/* Human Feedback Modal Prompt */}
      {showFeedback && (
        <FeedbackPrompt
          sessionId={sessionId}
          onSubmit={handleFeedbackSubmit}
          onCancel={() => setShowFeedback(false)}
        />
      )}

      {/* Primary Input Box (Only visible when chatting and not prompting) */}
      {screen === 'chat' && !pendingApproval && !showFeedback && (
        <InputBox
          onSubmit={handleUserPrompt}
          isLoading={isLoading}
          onCancel={handleCancel}
          onToggleThinking={() => setIsThinkingExpanded((prev) => !prev)}
        />
      )}
    </Box>
  );
};
