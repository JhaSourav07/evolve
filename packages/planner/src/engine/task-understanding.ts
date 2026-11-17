import {
  type ModelProvider,
  type StructuredRequirements,
  StructuredRequirementsSchema,
  validateOrThrow,
} from '@evolve/core';

export interface TaskUnderstandingOptions {
  provider: ModelProvider;
  projectOverview?: string | undefined;
  existingConventions?: string[] | undefined;
  signal?: AbortSignal | undefined;
}

export class TaskUnderstandingEngine {
  constructor(private readonly provider: ModelProvider) {}

  public async analyzeRequest(
    userPrompt: string,
    options?: Partial<TaskUnderstandingOptions>,
  ): Promise<StructuredRequirements> {
    const provider = options?.provider ?? this.provider;

    const systemPrompt = [
      'You are Evolve Task Understanding Engine, an expert software architecture analyst.',
      'Your job is to analyze natural-language software engineering requests and extract structured requirements.',
      '',
      'Rules:',
      '1. NEVER guess or invent unseen frameworks, libraries, or architectures.',
      '2. Identify primary objective, expected outcome, functional requirements, and technical constraints.',
      '3. Identify relevant project components based on actual repository facts if provided.',
      '4. If essential information is missing (e.g. choice of database, token expiry, hashing algorithm), list it explicitly in `missingInformation`.',
      '5. If the request is vague, note all uncertainties in `potentialAmbiguities`.',
      '6. Define rigorous, testable `acceptanceCriteria`.',
      '7. Respond with ONLY valid JSON adhering strictly to the schema.',
    ].join('\n');

    const contextSection = options?.projectOverview
      ? `\nRepository Context:\n${options.projectOverview}\n`
      : '';

    const conventionsSection =
      options?.existingConventions && options.existingConventions.length > 0
        ? `\nRepository Conventions:\n${options.existingConventions.map((c) => `- ${c}`).join('\n')}\n`
        : '';

    const userMessage = [
      `User Request: "${userPrompt}"`,
      contextSection,
      conventionsSection,
      '',
      'Return a JSON object conforming exactly to this structure:',
      '{',
      '  "primaryObjective": string,',
      '  "expectedOutcome": string,',
      '  "functionalRequirements": string[],',
      '  "technicalConstraints": string[],',
      '  "relevantComponents": string[],',
      '  "potentialAmbiguities": string[],',
      '  "missingInformation": string[],',
      '  "acceptanceCriteria": string[]',
      '}',
    ].join('\n');

    const response = await provider.generate(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      {
        temperature: 0.1,
        ...(options?.signal ? { signal: options.signal } : {}),
      },
    );

    return this.parseAndValidate(response.message.content);
  }

  public parseAndValidate(rawContent: string): StructuredRequirements {
    let clean = rawContent.trim();

    // Strip markdown code fences if present
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }

    // Try finding JSON object in content if there is conversational preamble
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(clean);
    } catch (err) {
      throw new Error(
        `Failed to parse task understanding JSON from model: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return validateOrThrow(StructuredRequirementsSchema, parsed);
  }
}

