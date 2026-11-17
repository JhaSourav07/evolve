import React, { useEffect, useRef, useState } from 'react';
import { Box, Static, useApp } from 'ink';
import type { EventEnvelope, ToolApprovalRequest, Plan, PlanId, PlanTask } from '@evolve/core';
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
import { PlanExecutionCard } from '../components/PlanExecutionCard.js';
import { PlanHistoryList } from '../components/PlanHistoryList.js';
import { ToolExecution } from '../components/ToolExecution.js';
import { MarkdownRenderer } from '../components/MarkdownRenderer.js';
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

  // Message counter for deterministic monotonic keys
  const msgCounterRef = useRef(0);

  // Static committed messages (rendered once, never redrawn, zero cursor jumping)
  const [staticMessages, setStaticMessages] = useState<ChatMessage[]>([
    {
      id: `msg_welcome_${++msgCounterRef.current}`,
      role: 'system',
      content: 'Evolve interactive session initialized. Type your request or /help for commands.',
      timestamp: Date.now(),
    },
  ]);

  // Active in-flight state (strictly bounded height)
  const [activeTool, setActiveTool] = useState<{
    toolName: string;
    args?: Record<string, unknown> | undefined;
    startTime: number;
  } | null>(null);

  const [streamingText, setStreamingText] = useState<string>('');
  const streamBufferRef = useRef<string>('');
  const throttleTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Active Plan Execution state
  const [executionState, setExecutionState] = useState<{
    plan: Plan;
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    currentTaskIndex: number;
    currentTask?: PlanTask | undefined;
    activeTool?: { toolName: string; detail?: string } | undefined;
    activeStage?: { stage: string; status: 'running' | 'passed' | 'failed' } | undefined;
    completedTasks: number;
    failedTasks: number;
    filesModified: string[];
    durationMs: number;
    error?: string | undefined;
  } | null>(null);

  // Clean cursor on unmount
  useEffect(() => {
    const handleResize = () => {
      // Force repaint boundary on resize without jumping
    };
    process.stdout.on('resize', handleResize);

    return () => {
      process.stdout.off('resize', handleResize);
      process.stdout.write('\x1b[?25h'); // Restore cursor
    };
  }, []);

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

      if (initialPrompt && initialPrompt.trim()) {
        setScreen('chat');
        handleUserPrompt(initialPrompt.trim());
      } else if (!initialModel && options.length > 0 && screen === 'model_select') {
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
    runtimeRef.current = null;
    const newSid = context.createSession();
    setSessionId(newSid);
    setStaticMessages((prev) => [
      ...prev,
      {
        id: `sys_${++msgCounterRef.current}`,
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

  // Throttled token streaming
  const handleStreamChunk = (delta: string) => {
    streamBufferRef.current += delta;
    if (!throttleTimerRef.current) {
      throttleTimerRef.current = setTimeout(() => {
        setStreamingText(streamBufferRef.current);
        throttleTimerRef.current = null;
      }, 45);
    }
  };

  const finalizeStreaming = () => {
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    const finalVal = streamBufferRef.current;
    streamBufferRef.current = '';
    setStreamingText('');
    return finalVal;
  };

  const handleUserPrompt = async (promptText: string) => {
    if (promptText.startsWith('/')) {
      handleSlashCommand(promptText);
      return;
    }

    // Add user message to static committed scrollback
    const userMsg: ChatMessage = {
      id: `usr_${++msgCounterRef.current}`,
      role: 'user',
      content: promptText,
      timestamp: Date.now(),
    };
    setStaticMessages((prev) => [...prev, userMsg]);

    // Check if user is expressing an explicit preference or convention
    const prefCandidate = context.memoryExtractor.extractFromUserInstruction(promptText, {
      projectId: context.projectId,
    });
    if (prefCandidate) {
      const saved = context.memoryConsolidator.consolidate(prefCandidate);
      setStaticMessages((prev) => [
        ...prev,
        {
          id: `mem_pref_${++msgCounterRef.current}`,
          role: 'system',
          content: `✔ Learned user preference [${saved.key}]: "${saved.content}"`,
          timestamp: Date.now(),
        },
      ]);
    }

    // Retrieve relevant memories for the prompt
    const retrieval = context.memoryRetriever.retrieve({
      prompt: promptText,
      projectId: context.projectId,
      maxTokens: 1500,
    });

    if (retrieval.memories.length > 0) {
      const topKeys = retrieval.memories.map((m) => m.key).slice(0, 3).join(', ');
      const extraCount = retrieval.memories.length > 3 ? ` +${retrieval.memories.length - 3} more` : '';
      setStaticMessages((prev) => [
        ...prev,
        {
          id: `mem_inf_${++msgCounterRef.current}`,
          role: 'system',
          content: `⛁ Applied ${retrieval.memories.length} relevant memories (${topKeys}${extraCount})`,
          timestamp: Date.now(),
        },
      ]);
    }

    setIsLoading(true);
    setScreen('chat');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
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
      let activeToolStartTime = 0;

      const unsub = runtime.onAny((event: EventEnvelope) => {
        if (event.type === 'tool_call') {
          const payload = event.payload as { toolName: string; arguments: Record<string, unknown> };
          activeToolStartTime = Date.now();
          setActiveTool({
            toolName: payload.toolName,
            args: payload.arguments,
            startTime: activeToolStartTime,
          });
        } else if (event.type === 'tool_result') {
          const payload = event.payload as {
            toolName: string;
            output?: string;
            error?: string;
            success: boolean;
          };
          const duration = activeToolStartTime > 0 ? Date.now() - activeToolStartTime : undefined;
          setActiveTool(null);
          setStaticMessages((prev) => [
            ...prev,
            {
              id: `tr_${++msgCounterRef.current}`,
              role: 'tool_result',
              content: payload.output ?? payload.error ?? '',
              toolName: payload.toolName,
              toolSuccess: payload.success,
              toolDurationMs: duration,
              timestamp: Date.now(),
            },
          ]);
        }
      });

      const result = await runtime.run(promptText, {
        signal: abortController.signal,
        sessionId,
        memories: retrieval.memories,
        onChunk: ({ delta }) => {
          handleStreamChunk(delta);
        },
      });

      unsub();
      finalizeStreaming();
      setActiveTool(null);

      if (!result.success) {
        setStaticMessages((prev) => [
          ...prev,
          {
            id: `err_${++msgCounterRef.current}`,
            role: 'error',
            content: result.error || 'Agent execution failed without model response.',
            recoveryHint:
              'Verify that Ollama is running (`ollama serve`) and the model is loaded. Use /model to switch.',
            timestamp: Date.now(),
          },
        ]);
      } else {
        setStaticMessages((prev) => [
          ...prev,
          {
            id: `asst_${++msgCounterRef.current}`,
            role: 'assistant',
            content: result.finalResponse || 'Task completed.',
            ...(result.thinking ? { thinking: result.thinking } : {}),
            timestamp: Date.now(),
          },
        ]);
      }
    } catch (err: unknown) {
      finalizeStreaming();
      setActiveTool(null);
      const errMessage = err instanceof Error ? err.message : String(err);
      const isAbort = errMessage.includes('abort') || abortController.signal.aborted;

      const recovery = isAbort
        ? undefined
        : `Check that Ollama is running and model "${activeModel}" is available. Use /model to switch.`;

      setStaticMessages((prev) => [
        ...prev,
        {
          id: `err_${++msgCounterRef.current}`,
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
      setStaticMessages((prev) => [
        ...prev,
        {
          id: `plan_app_${++msgCounterRef.current}`,
          role: 'system',
          content: `Plan ${pId} has been APPROVED. Ready for execution in Phase 3.`,
          timestamp: Date.now(),
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStaticMessages((prev) => [
        ...prev,
        {
          id: `err_${++msgCounterRef.current}`,
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
      setStaticMessages((prev) => [
        ...prev,
        {
          id: `plan_rej_${++msgCounterRef.current}`,
          role: 'system',
          content: `Plan ${pId} has been REJECTED.${reason ? ` Reason: "${reason}"` : ''}`,
          timestamp: Date.now(),
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStaticMessages((prev) => [
        ...prev,
        {
          id: `err_${++msgCounterRef.current}`,
          role: 'error',
          content: `Failed to reject plan ${pId}: ${msg}`,
          timestamp: Date.now(),
        },
      ]);
    }
  };

  const handleRegeneratePlan = async (pId: string) => {
    setIsLoading(true);
    setStaticMessages((prev) => [
      ...prev,
      {
        id: `plan_regen_${++msgCounterRef.current}`,
        role: 'system',
        content: `Regenerating plan ${pId} with updated repository analysis...`,
        timestamp: Date.now(),
      },
    ]);

    try {
      const regenerated = await context.planner.regeneratePlan(pId as PlanId);
      setActivePlan(regenerated);
      setScreen('plan');
      setStaticMessages((prev) => [
        ...prev,
        {
          id: `plan_regen_ok_${++msgCounterRef.current}`,
          role: 'system',
          content: `Plan regenerated successfully (Revision ${regenerated.revision}, ${regenerated.tasks.length} tasks).`,
          timestamp: Date.now(),
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStaticMessages((prev) => [
        ...prev,
        {
          id: `err_${++msgCounterRef.current}`,
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
    setStaticMessages((prev) => [
      ...prev,
      {
        id: `usr_${++msgCounterRef.current}`,
        role: 'user',
        content: `/plan ${mode === 'quick' ? 'quick ' : ''}${promptText}`,
        timestamp: Date.now(),
      },
      {
        id: `plan_gen_${++msgCounterRef.current}`,
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
      setStaticMessages((prev) => [
        ...prev,
        {
          id: `plan_ok_${++msgCounterRef.current}`,
          role: 'system',
          content: `Plan generated: "${plan.title}" (${plan.tasks.length} tasks, complexity: ${plan.estimatedComplexity}, risk: ${plan.risks.overallRisk}). Review and approve below.`,
          timestamp: Date.now(),
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStaticMessages((prev) => [
        ...prev,
        {
          id: `err_${++msgCounterRef.current}`,
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

  const handleRunPlan = async (targetPlanId?: string) => {
    let planToRun: Plan | undefined;
    if (targetPlanId) {
      planToRun = context.planRepo.findById(targetPlanId);
      if (!planToRun) {
        setStaticMessages((prev) => [
          ...prev,
          {
            id: `err_${++msgCounterRef.current}`,
            role: 'error',
            content: `Plan not found: ${targetPlanId}`,
            timestamp: Date.now(),
          },
        ]);
        return;
      }
    } else if (activePlan) {
      planToRun = activePlan;
    } else {
      const projectPlans = context.planRepo.findByProjectId(context.projectId);
      planToRun = projectPlans.find((p) => p.status === 'approved') || projectPlans[0];
    }

    if (!planToRun) {
      setStaticMessages((prev) => [
        ...prev,
        {
          id: `sys_${++msgCounterRef.current}`,
          role: 'system',
          content: 'No implementation plan available to run. Generate one first using /plan <objective>.',
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    if (planToRun.status !== 'approved') {
      setStaticMessages((prev) => [
        ...prev,
        {
          id: `sys_${++msgCounterRef.current}`,
          role: 'system',
          content: `Plan ${planToRun!.planId} is currently '${planToRun!.status}'. Approve it first using: /plan approve ${planToRun!.planId}`,
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    setActivePlan(planToRun);
    setScreen('chat');
    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    setExecutionState({
      plan: planToRun,
      status: 'running',
      currentTaskIndex: 0,
      currentTask: planToRun.tasks[0],
      completedTasks: 0,
      failedTasks: 0,
      filesModified: [],
      durationMs: 0,
    });

    try {
      const executor = context.createPlanExecutor();

      executor.getEventBus().on('task_started', (evt) => {
        const t = planToRun!.tasks.find((task) => task.id === evt.payload.taskId);
        setExecutionState((prev) =>
          prev
            ? {
                ...prev,
                currentTaskIndex: evt.payload.taskIndex,
                currentTask: t,
                activeTool: undefined,
                activeStage: undefined,
              }
            : null,
        );
      });

      executor.getEventBus().on('tool_execution_started', (evt) => {
        setExecutionState((prev) =>
          prev
            ? {
                ...prev,
                activeTool: { toolName: evt.payload.toolName },
              }
            : null,
        );
      });

      executor.getEventBus().on('tool_execution_completed', () => {
        setExecutionState((prev) =>
          prev
            ? {
                ...prev,
                activeTool: undefined,
              }
            : null,
        );
      });

      executor.getEventBus().on('verification_started', (evt) => {
        setExecutionState((prev) =>
          prev
            ? {
                ...prev,
                activeStage: { stage: evt.payload.stage, status: 'running' },
              }
            : null,
        );
      });

      executor.getEventBus().on('verification_completed', (evt) => {
        setExecutionState((prev) =>
          prev
            ? {
                ...prev,
                activeStage: {
                  stage: evt.payload.stage,
                  status: evt.payload.success ? 'passed' : 'failed',
                },
              }
            : null,
        );
      });

      executor.getEventBus().on('task_completed', (evt) => {
        setExecutionState((prev) =>
          prev
            ? {
                ...prev,
                completedTasks: prev.completedTasks + 1,
                filesModified: Array.from(
                  new Set([...prev.filesModified, ...evt.payload.filesModified]),
                ),
              }
            : null,
        );
      });

      executor.getEventBus().on('task_failed', () => {
        setExecutionState((prev) =>
          prev
            ? {
                ...prev,
                failedTasks: prev.failedTasks + 1,
              }
            : null,
        );
      });

      const res = await executor.executePlan(planToRun, {
        signal: abortControllerRef.current.signal,
      });

      setExecutionState((prev) =>
        prev
          ? {
              ...prev,
              status: res.status,
              durationMs: res.durationMs,
              error: res.error,
            }
          : null,
      );

      const refreshed = context.planRepo.findById(planToRun.planId);
      if (refreshed) setActivePlan(refreshed);

      setStaticMessages((prev) => [
        ...prev,
        {
          id: `exec_done_${++msgCounterRef.current}`,
          role: 'assistant',
          content: `Execution of plan "${planToRun!.title}" ${res.status.toUpperCase()}.\nCompleted ${res.tasksCompleted}/${planToRun!.tasks.length} tasks in ${(res.durationMs / 1000).toFixed(1)}s.${res.error ? `\nError: ${res.error}` : ''}`,
          timestamp: Date.now(),
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStaticMessages((prev) => [
        ...prev,
        {
          id: `err_${++msgCounterRef.current}`,
          role: 'error',
          content: `Plan execution failed: ${msg}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSlashCommand = async (cmdText: string) => {
    const parts = cmdText.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const arg = parts.slice(1).join(' ').trim();

    switch (cmd) {
      case '/help':
        setStaticMessages((prev) => [
          ...prev,
          {
            id: `sys_${++msgCounterRef.current}`,
            role: 'system',
            content: [
              'Evolve CLI Commands:',
              '  /chat            - Return to active chat view',
              '  /run [planId]    - Execute approved plan with verification and debugging',
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
              '  /memory          - View all persistent memories and experiences',
              '  /memory search <q> - Search memories using SQLite FTS5',
              '  /memory user     - View global user preferences',
              '  /memory project  - View project architecture decisions and rules',
              '  /memory experience - View verified debugging & task experiences',
              '  /memory failed   - View failed approaches and postmortems',
              '  /memory review   - Review proposed unverified memories',
              '  /memory approve <id> - Approve a proposed memory',
              '  /memory deprecate <id> - Deprecate an outdated memory',
              '  /memory delete <id> - Delete an incorrect memory',
              '  /memory add <cat> <k> <c> - Explicitly teach Evolve a preference or rule',
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
          setStaticMessages((m) => [
            ...m,
            {
              id: `sys_${++msgCounterRef.current}`,
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
          const num = parseInt(arg, 10);
          if (!isNaN(num) && num >= 1 && num <= models.length) {
            const chosen = models[num - 1];
            if (chosen) {
              selectModelAndStart(chosen.name);
              return;
            }
          }
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
        setScreen('model_select');
        break;
      }

      case '/clear':
        process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
        setStaticMessages([]);
        setScreen('chat');
        break;

      case '/new': {
        const newSid = context.createSession();
        setSessionId(newSid);
        runtimeRef.current = null;
        setStaticMessages([
          {
            id: `sys_${++msgCounterRef.current}`,
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

      case '/memory': {
        const subArg = arg.trim();
        if (!subArg) {
          loadMemoryData();
          setScreen('memory');
          break;
        }

        const [subCmd, ...restTokens] = subArg.split(/\s+/);
        const subCmdLower = subCmd?.toLowerCase();
        const remainder = restTokens.join(' ').trim();

        if (subCmdLower === 'search') {
          const searchRes = context.memoryRetriever.retrieve({
            prompt: remainder,
            projectId: context.projectId,
            maxTokens: 3000,
          });
          setMemoriesList(
            searchRes.memories.map((m) => ({
              id: m.id,
              category: m.category,
              key: m.key,
              content: m.content,
              confidence: m.confidence,
              sourceType: m.sourceType,
              verificationStatus: m.verificationStatus,
              accessCount: m.accessCount,
              supersededBy: m.supersededBy,
              projectId: m.projectId,
            })),
          );
          setScreen('memory');
        } else if (subCmdLower === 'user') {
          const prefs = context.memoryService.listPreferences();
          setMemoriesList(
            prefs.map((m) => ({
              id: m.id,
              category: m.category,
              key: m.key,
              content: m.content,
              confidence: m.confidence,
              sourceType: m.sourceType,
              verificationStatus: m.verificationStatus,
              accessCount: m.accessCount,
              projectId: m.projectId,
            })),
          );
          setScreen('memory');
        } else if (subCmdLower === 'project') {
          const rules = context.memoryService.listProjectRules(context.projectId);
          const decs = context.memoryService.listDecisions(context.projectId);
          setMemoriesList(
            [...rules, ...decs].map((m) => ({
              id: m.id,
              category: m.category,
              key: m.key,
              content: m.content,
              confidence: m.confidence,
              sourceType: m.sourceType,
              verificationStatus: m.verificationStatus,
              accessCount: m.accessCount,
              projectId: m.projectId,
            })),
          );
          setScreen('memory');
        } else if (subCmdLower === 'experience') {
          const exps = context.memoryService.listExperiences(context.projectId);
          setMemoriesList(
            exps.map((m) => ({
              id: m.id,
              category: m.category,
              key: m.key,
              content: m.content,
              confidence: m.confidence,
              sourceType: m.sourceType,
              verificationStatus: m.verificationStatus,
              accessCount: m.accessCount,
              projectId: m.projectId,
            })),
          );
          setScreen('memory');
        } else if (subCmdLower === 'failed') {
          const failed = context.memoryService.listFailedAttempts(context.projectId);
          setMemoriesList(
            failed.map((m) => ({
              id: m.id,
              category: m.category,
              key: m.key,
              content: m.content,
              confidence: m.confidence,
              sourceType: m.sourceType,
              verificationStatus: m.verificationStatus,
              accessCount: m.accessCount,
              projectId: m.projectId,
            })),
          );
          setScreen('memory');
        } else if (subCmdLower === 'review' || subCmdLower === 'proposed') {
          const proposed = context.memoryService.listProposed(context.projectId);
          setMemoriesList(
            proposed.map((m) => ({
              id: m.id,
              category: m.category,
              key: m.key,
              content: m.content,
              confidence: m.confidence,
              sourceType: m.sourceType,
              verificationStatus: m.verificationStatus,
              accessCount: m.accessCount,
              projectId: m.projectId,
            })),
          );
          setScreen('memory');
        } else if (subCmdLower === 'approve' || subCmdLower === 'verify') {
          if (remainder) {
            context.memoryService.updateStatus(remainder, 'verified');
            setStaticMessages((prev) => [
              ...prev,
              {
                id: `mem_appr_${++msgCounterRef.current}`,
                role: 'system',
                content: `✔ Approved memory ${remainder} as 'verified'`,
                timestamp: Date.now(),
              },
            ]);
          } else {
            setStaticMessages((prev) => [
              ...prev,
              {
                id: `mem_err_${++msgCounterRef.current}`,
                role: 'error',
                content: 'Usage: /memory approve <memoryId>',
                timestamp: Date.now(),
              },
            ]);
          }
        } else if (subCmdLower === 'deprecate') {
          if (remainder) {
            context.memoryService.deprecate(remainder);
            setStaticMessages((prev) => [
              ...prev,
              {
                id: `mem_depr_${++msgCounterRef.current}`,
                role: 'system',
                content: `✔ Deprecated memory ${remainder}`,
                timestamp: Date.now(),
              },
            ]);
          } else {
            setStaticMessages((prev) => [
              ...prev,
              {
                id: `mem_err_${++msgCounterRef.current}`,
                role: 'error',
                content: 'Usage: /memory deprecate <memoryId>',
                timestamp: Date.now(),
              },
            ]);
          }
        } else if (subCmdLower === 'delete') {
          if (remainder) {
            context.memoryService.delete(remainder);
            setStaticMessages((prev) => [
              ...prev,
              {
                id: `mem_del_${++msgCounterRef.current}`,
                role: 'system',
                content: `✔ Deleted memory ${remainder}`,
                timestamp: Date.now(),
              },
            ]);
          } else {
            setStaticMessages((prev) => [
              ...prev,
              {
                id: `mem_err_${++msgCounterRef.current}`,
                role: 'error',
                content: 'Usage: /memory delete <memoryId>',
                timestamp: Date.now(),
              },
            ]);
          }
        } else if (subCmdLower === 'add') {
          const [cat, key, ...contentTokens] = restTokens;
          const text = contentTokens.join(' ').trim();
          if (cat && key && text) {
            const saved = context.memoryConsolidator.consolidate({
              category: cat as any,
              key,
              content: text,
              projectId: cat === 'user_preference' ? undefined : context.projectId,
              sourceType: 'explicit_user',
              confidence: 1.0,
              verificationStatus: 'verified',
            });
            setStaticMessages((prev) => [
              ...prev,
              {
                id: `mem_add_${++msgCounterRef.current}`,
                role: 'system',
                content: `✔ Added memory [${saved.category}] ${saved.key}: "${saved.content}"`,
                timestamp: Date.now(),
              },
            ]);
          } else {
            setStaticMessages((prev) => [
              ...prev,
              {
                id: `mem_err_${++msgCounterRef.current}`,
                role: 'error',
                content: 'Usage: /memory add <user_preference|project_rule|experience> <key> <content>',
                timestamp: Date.now(),
              },
            ]);
          }
        } else {
          loadMemoryData();
          setScreen('memory');
        }
        break;
      }

      case '/integrations':
        setScreen('integrations');
        break;

      case '/feedback':
        setShowFeedback(true);
        break;

      case '/chat':
        setScreen('chat');
        break;

      case '/run':
      case '/execute': {
        const targetId = arg.trim() || undefined;
        await handleRunPlan(targetId);
        break;
      }

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
              setStaticMessages((prev) => [
                ...prev,
                {
                  id: `sys_${++msgCounterRef.current}`,
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
            setStaticMessages((prev) => [
              ...prev,
              {
                id: `err_${++msgCounterRef.current}`,
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
            setStaticMessages((prev) => [
              ...prev,
              {
                id: `err_${++msgCounterRef.current}`,
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
            setStaticMessages((prev) => [
              ...prev,
              {
                id: `err_${++msgCounterRef.current}`,
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
            setStaticMessages((prev) => [
              ...prev,
              {
                id: `err_${++msgCounterRef.current}`,
                role: 'error',
                content: 'Please specify your objective: /plan detailed <objective>',
                timestamp: Date.now(),
              },
            ]);
          } else {
            await handleCreatePlan(remainder, 'detailed');
          }
        } else {
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
        setStaticMessages((prev) => [
          ...prev,
          {
            id: `err_${++msgCounterRef.current}`,
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
    const raw = context.memoryService.listAll(context.projectId);
    const globalPrefs = context.memoryService.listPreferences();
    const combined = [...raw];
    for (const p of globalPrefs) {
      if (!combined.some((m) => m.id === p.id)) {
        combined.unshift(p);
      }
    }
    const entries: MemoryEntry[] = combined.map((m) => ({
      id: m.id,
      category: m.category,
      key: m.key,
      content: m.content,
      confidence: m.confidence,
      sourceType: m.sourceType,
      verificationStatus: m.verificationStatus,
      accessCount: m.accessCount,
      supersededBy: m.supersededBy,
      projectId: m.projectId,
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
      setStaticMessages((prev) => [
        ...prev,
        {
          id: `fb_${++msgCounterRef.current}`,
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
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {/* 1. Static History (Committed once to terminal scrollback, zero cursor jump, zero flicker) */}
      <Static items={staticMessages}>
        {(msg) => (
          <MessageItem key={msg.id} message={msg} isThinkingExpanded={isThinkingExpanded} />
        )}
      </Static>

      {/* 2. Compact 1-line header */}
      <Header
        projectName={context.rootDir.split('/').pop() || 'Evolve Project'}
        model={activeModel}
        gitBranch={gitBranch}
        isOnline={isOnline}
        activeScreen={screen}
      />

      {/* 3. Live Active Area (strictly small and bounded in height) */}
      {screen === 'chat' && (
        <Box flexDirection="column">
          {/* Active running tool call */}
          {activeTool && (
            <ToolExecution
              toolName={activeTool.toolName}
              args={activeTool.args}
              status="running"
              isExpanded={isThinkingExpanded}
            />
          )}

          {/* Active streaming text */}
          {streamingText.length > 0 && (
            <Box paddingLeft={2} marginY={1}>
              <MarkdownRenderer content={streamingText} />
            </Box>
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

          {/* Active running plan execution */}
          {executionState && (
            <PlanExecutionCard
              plan={executionState.plan}
              status={executionState.status}
              currentTaskIndex={executionState.currentTaskIndex}
              currentTask={executionState.currentTask}
              activeTool={executionState.activeTool}
              activeStage={executionState.activeStage}
              completedTasks={executionState.completedTasks}
              failedTasks={executionState.failedTasks}
              filesModified={executionState.filesModified}
              durationMs={executionState.durationMs}
              error={executionState.error}
            />
          )}

          {/* Primary Input Box */}
          {!pendingApproval && !showFeedback && (
            <InputBox
              onSubmit={handleUserPrompt}
              isLoading={isLoading}
              onCancel={handleCancel}
              onToggleThinking={() => setIsThinkingExpanded((prev) => !prev)}
            />
          )}
        </Box>
      )}

      {/* Secondary Screens */}
      {screen === 'model_select' && (
        <ModelSelectPrompt
          models={modelsList}
          isOnline={isOnline}
          providerUrl={context.config.model.baseUrl}
          currentModel={activeModel}
          onSelect={selectModelAndStart}
          onCancel={() => {
            if (staticMessages.length > 1) {
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
          onRun={(pId) => handleRunPlan(pId)}
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
    </Box>
  );
};
