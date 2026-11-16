import { existsSync, mkdirSync } from 'node:fs';
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
  ProjectRepository,
  SessionRepository,
  type EvolveDatabaseInstance,
} from '@evolve/db';
import { ConsentManager, TerminalAdapter } from '@evolve/integrations';

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
  public readonly eventService: EventService;
  public readonly feedbackService: FeedbackService;
  public readonly memoryService: MemoryService;
  public readonly consentManager: ConsentManager;
  public readonly terminalAdapter: TerminalAdapter;
  public readonly provider: OllamaProvider;
  public readonly projectId: string;

  constructor(options: CliContextOptions = {}) {
    this.rootDir = options.rootDir ?? process.cwd();

    // 1. Ensure .evolve directory exists
    const evolveDir = join(this.rootDir, '.evolve');
    if (!existsSync(evolveDir)) {
      mkdirSync(evolveDir, { recursive: true });
    }

    // 2. Validate configuration
    this.config = validateOrThrow(EvolveConfigSchema, {
      workspace: { rootDir: this.rootDir },
      model: options.modelName ? { model: options.modelName } : undefined,
    });

    // 3. Connect to SQLite database
    const dbFile = options.dbPath ?? join(evolveDir, 'evolve.db');
    this.dbInstance = initDatabase({ path: dbFile });

    // 4. Initialize Database Repositories & Services
    this.projectRepo = new ProjectRepository(this.dbInstance.db);
    this.sessionRepo = new SessionRepository(this.dbInstance.db);
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
    const initialModel = options.modelName || this.config.model.model;
    this.provider = new OllamaProvider({
      model: initialModel,
      baseUrl: this.config.model.baseUrl,
      timeoutMs: 120_000,
    });
  }

  public setModel(model: string): void {
    this.provider.setModel(model);
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

    // Record session started event
    this.eventService.publish(sessionId, 'session_started', {
      goal,
      workspaceRoot: this.rootDir,
      modelConfig: {
        model: this.config.model.model,
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
