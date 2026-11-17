import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { AgentRuntime, createDefaultToolRegistry, OllamaProvider } from '@evolve/agent';
import {
  createSessionId,
  type EvolveConfig,
  EvolveConfigSchema,
  validateOrThrow,
  type SessionId,
  type ToolApprovalHandler,
} from '@evolve/core';
import {
  initDatabase,
  EventService,
  FeedbackService,
  MemoryService,
  PlanRepository,
  ProjectRepository,
  SessionRepository,
  type EvolveDatabaseInstance,
} from '@evolve/db';
import { ConsentManager, TerminalAdapter } from '@evolve/integrations';
import { PlanningEngine } from '@evolve/planner';

export interface CliContextOptions {
  rootDir?: string | undefined;
  dbPath?: string | undefined;
  approvalHandler?: ToolApprovalHandler | undefined;
  modelName?: string | undefined;
}

export class CliContext {
  public readonly rootDir: string;
  public readonly config: EvolveConfig;
  public readonly dbInstance: EvolveDatabaseInstance;
  public readonly projectRepo: ProjectRepository;
  public readonly sessionRepo: SessionRepository;
  public readonly planRepo: PlanRepository;
  public readonly eventService: EventService;
  public readonly feedbackService: FeedbackService;
  public readonly memoryService: MemoryService;
  public readonly consentManager: ConsentManager;
  public readonly terminalAdapter: TerminalAdapter;
  public readonly provider: OllamaProvider;
  public readonly projectId: string;
  public readonly contextWindow: number;
  public readonly planner: PlanningEngine;

  constructor(options: CliContextOptions = {}) {
    this.rootDir = options.rootDir ?? process.cwd();

    // 1. Ensure .evolve directory exists
    const evolveDir = join(this.rootDir, '.evolve');
    if (!existsSync(evolveDir)) {
      mkdirSync(evolveDir, { recursive: true });
    }

    // Load .evolve/config.json if present
    const configFile = join(evolveDir, 'config.json');
    let fileConfig: Record<string, unknown> = {};
    if (existsSync(configFile)) {
      try {
        fileConfig = JSON.parse(readFileSync(configFile, 'utf8'));
      } catch {
        // ignore malformed config
      }
    }

    const fileModelConfig = (fileConfig.model as Record<string, unknown> | undefined) || {};
    const selectedModel =
      options.modelName ||
      (typeof fileModelConfig.model === 'string' ? fileModelConfig.model : undefined);

    // 2. Validate configuration
    this.config = validateOrThrow(EvolveConfigSchema, {
      ...fileConfig,
      workspace: { rootDir: this.rootDir },
      model: {
        ...fileModelConfig,
        ...(selectedModel ? { model: selectedModel } : {}),
      },
    });

    // 3. Connect to SQLite database
    const dbFile = options.dbPath ?? join(evolveDir, 'evolve.db');
    this.dbInstance = initDatabase({ path: dbFile });

    // 4. Initialize Database Repositories & Services
    this.projectRepo = new ProjectRepository(this.dbInstance.db);
    this.sessionRepo = new SessionRepository(this.dbInstance.db);
    this.planRepo = new PlanRepository(this.dbInstance.db);
    this.eventService = new EventService(this.dbInstance.db);
    this.feedbackService = new FeedbackService(this.dbInstance.db);
    this.memoryService = new MemoryService(this.dbInstance.db, this.dbInstance.sqlite);

    // 5. Ensure Project row exists in DB
    this.projectId = `proj_${Buffer.from(this.rootDir).toString('hex').slice(-12)}`;
    const existingProject = this.projectRepo.findById(this.projectId);
    if (!existingProject) {
      this.projectRepo.create({
        id: this.projectId,
        name: this.rootDir.split('/').pop() || 'Evolve Project',
        path: this.rootDir,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    // 6. Integrations & Consent
    this.consentManager = new ConsentManager({
      allowTerminalCollection: true,
      allowVSCodeCollection: true,
      allowClaudeImport: true,
      allowGeminiImport: true,
      allowedWorkspaceRoots: [this.rootDir],
    });
    this.terminalAdapter = new TerminalAdapter(this.consentManager, this.eventService);

    // 7. Ollama Model Provider (dynamic, unhardcoded model selection)
    const initialModel = options.modelName || selectedModel || this.config.model.model;
    const totalRamGb = os.totalmem() / (1024 * 1024 * 1024);
    const defaultSafeContextWindow = totalRamGb < 20 ? 8_192 : 16_384;
    this.contextWindow =
      typeof fileModelConfig.contextWindow === 'number'
        ? (fileModelConfig.contextWindow as number)
        : defaultSafeContextWindow;

    this.provider = new OllamaProvider({
      model: initialModel,
      baseUrl: this.config.model.baseUrl,
      contextWindow: this.contextWindow,
      timeoutMs: 120_000,
    });

    // 8. Planning Engine (Repository-Aware Planning, Task Decomposition & DAG)
    this.planner = new PlanningEngine({
      provider: this.provider,
      db: this.dbInstance.db,
      sqlite: this.dbInstance.sqlite,
      rootDir: this.rootDir,
      projectId: this.projectId,
      eventSink: this.eventService,
    });
  }

  public setModel(model: string): void {
    this.provider.setModel(model);
    (this.config.model as { model: string }).model = model;

    // Persist user selection to .evolve/config.json
    try {
      const evolveDir = join(this.rootDir, '.evolve');
      const configFile = join(evolveDir, 'config.json');
      let currentData: Record<string, unknown> = {};
      if (existsSync(configFile)) {
        try {
          currentData = JSON.parse(readFileSync(configFile, 'utf8'));
        } catch {
          currentData = {};
        }
      }
      const updated = {
        ...currentData,
        model: {
          ...((currentData.model as Record<string, unknown> | undefined) || {}),
          model,
        },
      };
      writeFileSync(configFile, JSON.stringify(updated, null, 2), 'utf8');
    } catch {
      // non-blocking persistence
    }
  }

  public getModel(): string {
    return this.provider.getModel();
  }

  public async discoverModels() {
    return this.provider.listModels();
  }

  public createSession(goal: string = 'Interactive CLI Session'): SessionId {
    const sessionId = createSessionId();
    this.sessionRepo.create({
      id: sessionId,
      projectId: this.projectId,
      goal,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const activeModel = this.provider.getModel() || this.config.model.model;

    // Record session started event
    this.eventService.publish(sessionId, 'session_started', {
      goal,
      workspaceRoot: this.rootDir,
      modelConfig: {
        model: activeModel,
        provider: 'ollama',
      },
    });

    return sessionId;
  }

  public createAgentRuntime(
    sessionId: SessionId,
    approvalHandler?: ToolApprovalHandler,
  ): AgentRuntime {
    const tools = createDefaultToolRegistry();

    // Retrieve memories for context
    const recentMemories = this.memoryService.search('', {
      projectId: this.projectId,
      limit: 5,
    });

    const memoryBullets: string[] = [];
    for (const m of recentMemories) {
      memoryBullets.push(`- [${m.category}] ${m.key}: ${m.content}`);
    }

    const systemPrompt =
      memoryBullets.length > 0
        ? `You are Evolve, an expert autonomous software engineering AI agent.\n\nProject Knowledge & Memory:\n${memoryBullets.join('\n')}`
        : undefined;

    return new AgentRuntime({
      provider: this.provider,
      tools,
      eventSink: this.eventService,
      config: {
        workspaceRoot: this.rootDir,
        maxSteps: this.config.maxStepsPerSession,
        maxContextTokens: Math.floor(this.contextWindow * 0.75),
        temperature: this.config.model.temperature,
        systemPrompt,
        requestApproval: approvalHandler,
        projectId: this.projectId,
        database: this.dbInstance,
      },
    });
  }

  public close(): void {
    this.dbInstance.close();
  }
}
