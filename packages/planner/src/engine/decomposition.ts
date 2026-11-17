import {
  type ModelMessage,
  type ModelProvider,
  type Plan,
  type PlanMode,
  PlanSchema,
  type PlanTask,
  type ProjectRiskAssessment,
  type StructuredRequirements,
  createPlanId,
  validateOrThrow,
} from '@evolve/core';
import { DirectedAcyclicGraph } from '../dag/graph.js';
import type { RepositoryEvidence } from './repo-context.js';

export interface PlanGenerationOptions {
  sessionId: string;
  projectId: string;
  mode?: PlanMode | undefined;
  provider?: ModelProvider | undefined;
  signal?: AbortSignal | undefined;
}

interface RawPlanModelOutput {
  title: string;
  objective: string;
  assumptions: string[];
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    objective: string;
    relevantFiles?: string[];
    expectedChanges?: string[];
    dependencies?: string[];
    verificationSteps?: string[];
    estimatedComplexity?: 'low' | 'medium' | 'high';
    estimatedRisk?: 'low' | 'medium' | 'high';
    potentialRisks?: string[];
    affectedComponents?: string[];
    breakingChange?: boolean;
    securityImplications?: string;
  }>;
  risks: ProjectRiskAssessment;
  acceptanceCriteria: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
}

export class TaskDecompositionEngine {
  constructor(private readonly defaultProvider: ModelProvider) {}

  public async generatePlan(
    userPrompt: string,
    requirements: StructuredRequirements,
    evidence: RepositoryEvidence,
    options: PlanGenerationOptions,
  ): Promise<Plan> {
    const provider = options.provider ?? this.defaultProvider;
    const mode = options.mode ?? 'detailed';

    const systemPrompt = [
      'You are Evolve Planning Engine, an expert software architecture task planner.',
      'Your job is to convert structured software engineering requirements into an executable implementation plan.',
      '',
      'Core Rules:',
      '1. NEVER execute code or commands. Only produce a structured plan.',
      '2. Anchor all tasks in real repository files and conventions provided in the evidence. Do not hallucinate fake paths.',
      '3. Decompose the objective into logically ordered, discrete tasks with IDs like "task_1", "task_2", etc.',
      '4. Specify explicit dependencies: if task_3 requires task_1 and task_2, set dependencies: ["task_1", "task_2"].',
      '5. The dependency graph MUST be a Directed Acyclic Graph (DAG). Absolutely NO circular dependencies.',
      mode === 'quick'
        ? '6. Quick Mode: Generate a concise plan (3 to 5 tasks max) focusing on the essential steps.'
        : '6. Detailed Mode: Generate a thorough plan (5 to 10 tasks) with explicit verification steps, expected changes, risks, and affected components.',
      '7. Assess complexity and risk (low, medium, high) realistically. Do not present speculative estimates as exact facts.',
      '8. Respond with ONLY valid JSON adhering strictly to the schema.',
    ].join('\n');

    const userMessage = [
      `User Request: "${userPrompt}"`,
      '',
      `Mode: ${mode}`,
      '',
      'Structured Requirements:',
      JSON.stringify(requirements, null, 2),
      '',
      'Repository Evidence:',
      evidence.contextSummary || 'No existing repository context available.',
      '',
      'Generate a JSON response conforming exactly to this structure:',
      '{',
      '  "title": string,',
      '  "objective": string,',
      '  "assumptions": string[],',
      '  "tasks": [',
      '    {',
      '      "id": "task_1",',
      '      "title": string,',
      '      "description": string,',
      '      "objective": string,',
      '      "relevantFiles": string[],',
      '      "expectedChanges": string[],',
      '      "dependencies": string[],',
      '      "verificationSteps": string[],',
      '      "estimatedComplexity": "low" | "medium" | "high",',
      '      "estimatedRisk": "low" | "medium" | "high",',
      '      "potentialRisks": string[],',
      '      "affectedComponents": string[],',
      '      "breakingChange": boolean,',
      '      "securityImplications": string',
      '    }',
      '  ],',
      '  "risks": {',
      '    "overallRisk": "low" | "medium" | "high",',
      '    "overallComplexity": "low" | "medium" | "high",',
      '    "summary": string,',
      '    "criticalRisks": string[],',
      '    "recommendations": string[],',
      '    "securityConsiderations": string[],',
      '    "dataMigrationConsiderations": string[],',
      '    "testingRequirements": string[]',
      '  },',
      '  "acceptanceCriteria": string[],',
      '  "estimatedComplexity": "low" | "medium" | "high"',
      '}',
    ].join('\n');

    let currentMessages: ModelMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;

      const response = await provider.generate(currentMessages, {
        temperature: 0.2,
        ...(options.signal ? { signal: options.signal } : {}),
      });

      try {
        const rawOutput = this.parseRawJson<RawPlanModelOutput>(response.message.content);

        // Normalize task fields and ensure sensible defaults
        const normalizedTasks: PlanTask[] = (rawOutput.tasks || []).map((t, idx) => ({
          id: t.id || `task_${idx + 1}`,
          title: t.title || `Task ${idx + 1}`,
          description: t.description || '',
          objective: t.objective || t.title || '',
          relevantFiles: Array.isArray(t.relevantFiles) ? t.relevantFiles : [],
          expectedChanges: Array.isArray(t.expectedChanges) ? t.expectedChanges : [],
          dependencies: Array.isArray(t.dependencies) ? t.dependencies : [],
          verificationSteps: Array.isArray(t.verificationSteps) ? t.verificationSteps : [],
          estimatedComplexity: t.estimatedComplexity || 'medium',
          estimatedRisk: t.estimatedRisk || 'low',
          potentialRisks: Array.isArray(t.potentialRisks) ? t.potentialRisks : [],
          affectedComponents: Array.isArray(t.affectedComponents) ? t.affectedComponents : [],
          breakingChange: Boolean(t.breakingChange),
          securityImplications: t.securityImplications || undefined,
          status: 'pending',
        }));

        if (normalizedTasks.length === 0) {
          throw new Error('Generated plan contains 0 tasks');
        }

        // Validate DAG and resolve dependencies
        const dag = new DirectedAcyclicGraph(normalizedTasks);
        const dagValidation = dag.validate();
        if (!dagValidation.valid) {
          throw new Error(`DAG validation failed: ${dagValidation.errors.join('; ')}`);
        }

        // Build explicit dependencies array from DAG
        const dependencies: Array<{ fromTaskId: string; toTaskId: string }> = [];
        for (const t of normalizedTasks) {
          for (const depId of t.dependencies) {
            dependencies.push({ fromTaskId: depId, toTaskId: t.id });
          }
        }

        const now = Date.now();
        const candidatePlan: Plan = {
          planId: createPlanId(),
          sessionId: options.sessionId,
          projectId: options.projectId,
          title: rawOutput.title || `Plan: ${userPrompt.slice(0, 50)}`,
          objective: rawOutput.objective || requirements.primaryObjective,
          mode,
          requirements,
          assumptions: Array.isArray(rawOutput.assumptions) ? rawOutput.assumptions : [],
          tasks: normalizedTasks,
          dependencies,
          risks: {
            overallRisk: rawOutput.risks?.overallRisk || 'medium',
            overallComplexity: rawOutput.risks?.overallComplexity || 'medium',
            summary: rawOutput.risks?.summary || '',
            criticalRisks: Array.isArray(rawOutput.risks?.criticalRisks)
              ? rawOutput.risks.criticalRisks
              : [],
            recommendations: Array.isArray(rawOutput.risks?.recommendations)
              ? rawOutput.risks.recommendations
              : [],
            securityConsiderations: Array.isArray(rawOutput.risks?.securityConsiderations)
              ? rawOutput.risks.securityConsiderations
              : [],
            dataMigrationConsiderations: Array.isArray(rawOutput.risks?.dataMigrationConsiderations)
              ? rawOutput.risks.dataMigrationConsiderations
              : [],
            testingRequirements: Array.isArray(rawOutput.risks?.testingRequirements)
              ? rawOutput.risks.testingRequirements
              : [],
          },
          acceptanceCriteria: Array.isArray(rawOutput.acceptanceCriteria)
            ? rawOutput.acceptanceCriteria
            : requirements.acceptanceCriteria,
          estimatedComplexity: rawOutput.estimatedComplexity || 'medium',
          status: 'awaiting_approval',
          revision: 1,
          createdAt: now,
          updatedAt: now,
        };

        // Strict Zod validation
        return validateOrThrow(PlanSchema, candidatePlan);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (attempts >= maxAttempts) {
          throw new Error(
            `Failed to generate valid plan after ${maxAttempts} attempts: ${errorMsg}`,
          );
        }

        // Bounded self-repair prompt
        currentMessages = [
          ...currentMessages,
          { role: 'assistant', content: response.message.content },
          {
            role: 'user',
            content: `Your previous plan JSON was invalid: ${errorMsg}. Please fix the validation errors and return valid JSON adhering strictly to the schema with valid non-circular task dependencies.`,
          },
        ];
      }
    }

    throw new Error('Plan generation exhausted retry attempts without producing valid plan');
  }

  private parseRawJson<T>(content: string): T {
    let clean = content.trim();

    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }

    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }

    return JSON.parse(clean) as T;
  }
}
