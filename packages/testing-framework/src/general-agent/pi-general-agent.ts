/**
 * Default general agent, backed by Pi (`@earendil-works/pi-coding-agent`).
 *
 * This is the Phase 0 implementation of the swappable general agent layer used
 * by `verify` / `soft` / `agent` nodes.
 *
 * Decision C′ (RFC §4.1 / §10) — RESOLVED here. Pi exposes
 * `ModelRegistry.registerProvider({ baseUrl, apiKey, models })`, which lets us
 * point Pi at the SAME OpenAI-compatible endpoint Midscene's UI Agent uses
 * (`MIDSCENE_MODEL_BASE_URL` / `MIDSCENE_MODEL_API_KEY` / `MIDSCENE_MODEL_NAME`).
 * So `verify`/`agent` and `ui` share one model endpoint without any Pi changes.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Type } from '@earendil-works/pi-ai';
import type { Model } from '@earendil-works/pi-ai';
import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  createAgentSession,
  defineTool,
  getAgentDir,
} from '@earendil-works/pi-coding-agent';
import { getDebug } from '@midscene/shared/logger';
import type { Verdict } from '../types';
import type {
  GeneralAgentAdapter,
  GeneralAgentInput,
  GeneralAgentResult,
} from './types';

const debug = getDebug('testing-framework:pi');

const PROVIDER_NAME = 'midscene';

export interface PiGeneralAgentOptions {
  /** Endpoint base URL. Defaults to MIDSCENE_MODEL_BASE_URL. */
  baseUrl?: string;
  /** API key. Defaults to MIDSCENE_MODEL_API_KEY. */
  apiKey?: string;
  /** Model id/name. Defaults to MIDSCENE_MODEL_NAME. */
  modelName?: string;
  /** Context window hint passed to Pi. */
  contextWindow?: number;
  /** Max output tokens hint passed to Pi. */
  maxTokens?: number;
}

interface PreparedModel {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  model: Model<'openai-completions'>;
}

/**
 * Pi-backed implementation of {@link GeneralAgentAdapter}.
 */
export class PiGeneralAgent implements GeneralAgentAdapter {
  /** Pi registers a `report_verdict` tool, so the prompt demands it. */
  readonly verdictInstructions =
    'Make a judgment. You MUST finish by calling the `report_verdict` tool ' +
    'with `pass`, `reason`, and optional `evidence`. If you cannot ' +
    'confidently determine the result, report `pass: false`.';

  private prepared?: PreparedModel;
  private readonly loaderCache = new Map<string, DefaultResourceLoader>();

  constructor(private readonly options: PiGeneralAgentOptions = {}) {}

  async run(input: GeneralAgentInput): Promise<GeneralAgentResult> {
    const prepared = this.prepareModel();
    const loader = await this.getResourceLoader(input.projectRoot);

    let capturedVerdict: Verdict | undefined;
    const needsVerdict = input.kind === 'verify' || input.kind === 'soft';

    const customTools = needsVerdict
      ? [
          defineTool({
            name: 'report_verdict',
            label: 'Report verdict',
            description:
              'Call this exactly once when your judgment is complete to submit ' +
              'the pass/fail verdict for this verification.',
            parameters: Type.Object({
              pass: Type.Boolean({
                description: 'Whether the verification passed.',
              }),
              reason: Type.String({
                description: 'Human-readable rationale for the verdict.',
              }),
              evidence: Type.Optional(
                Type.Unknown({
                  description: 'Optional supporting evidence.',
                }),
              ),
            }),
            execute: async (_id, params) => {
              capturedVerdict = {
                pass: params.pass,
                reason: params.reason,
                evidence: params.evidence,
              };
              return {
                content: [{ type: 'text', text: 'Verdict recorded.' }],
                details: capturedVerdict,
                terminate: true,
              };
            },
          }),
        ]
      : [];

    const { session } = await createAgentSession({
      cwd: input.projectRoot,
      model: prepared.model,
      modelRegistry: prepared.modelRegistry,
      authStorage: prepared.authStorage,
      sessionManager: SessionManager.inMemory(),
      resourceLoader: loader,
      customTools,
      // verify/agent only read the UI; they must not mutate the project files.
      // `read` and `bash` stay enabled so skills can fetch external context.
      excludeTools: ['edit', 'write'],
    });

    try {
      const promptText = this.buildPrompt(input);
      const images = input.screenshotBase64
        ? [
            {
              type: 'image' as const,
              data: input.screenshotBase64,
              mimeType: input.screenshotMediaType ?? 'image/png',
            },
          ]
        : undefined;

      await session.prompt(promptText, images ? { images } : undefined);

      const text = session.getLastAssistantText() ?? '';
      debug('pi run finished', {
        kind: input.kind,
        hasVerdict: Boolean(capturedVerdict),
      });

      return { text, verdict: capturedVerdict };
    } finally {
      session.dispose();
    }
  }

  private buildPrompt(input: GeneralAgentInput): string {
    const parts = [input.context];
    if (input.referencedSkills.length > 0) {
      parts.push('');
      parts.push(
        `This task references the following skills: ${input.referencedSkills
          .map((s) => `$${s}`)
          .join(', ')}. Load and use them as needed to complete the task.`,
      );
    }
    return parts.join('\n');
  }

  private prepareModel(): PreparedModel {
    if (this.prepared) return this.prepared;

    const baseUrl = this.options.baseUrl ?? process.env.MIDSCENE_MODEL_BASE_URL;
    const apiKey = this.options.apiKey ?? process.env.MIDSCENE_MODEL_API_KEY;
    const modelName = this.options.modelName ?? process.env.MIDSCENE_MODEL_NAME;

    if (!baseUrl) {
      throw new Error(
        '[midscene] Pi general agent requires MIDSCENE_MODEL_BASE_URL ' +
          '(or PiGeneralAgentOptions.baseUrl) so verify/agent share the UI Agent endpoint.',
      );
    }
    if (!apiKey) {
      throw new Error(
        '[midscene] Pi general agent requires MIDSCENE_MODEL_API_KEY (or PiGeneralAgentOptions.apiKey).',
      );
    }
    if (!modelName) {
      throw new Error(
        '[midscene] Pi general agent requires MIDSCENE_MODEL_NAME (or PiGeneralAgentOptions.modelName).',
      );
    }

    const authStorage = AuthStorage.inMemory();
    const modelRegistry = ModelRegistry.inMemory(authStorage);

    modelRegistry.registerProvider(PROVIDER_NAME, {
      baseUrl,
      apiKey,
      models: [
        {
          id: modelName,
          name: modelName,
          api: 'openai-completions',
          reasoning: false,
          input: ['text', 'image'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: this.options.contextWindow ?? 128_000,
          maxTokens: this.options.maxTokens ?? 8_192,
        },
      ],
    });

    const model = modelRegistry.find(PROVIDER_NAME, modelName) as
      | Model<'openai-completions'>
      | undefined;
    if (!model) {
      throw new Error(
        `[midscene] Failed to register Pi model "${modelName}" at ${baseUrl}.`,
      );
    }

    this.prepared = { authStorage, modelRegistry, model };
    return this.prepared;
  }

  private async getResourceLoader(
    projectRoot: string,
  ): Promise<DefaultResourceLoader> {
    const cached = this.loaderCache.get(projectRoot);
    if (cached) return cached;

    // Convention: project skills live under `<projectRoot>/skills`. Pi also
    // discovers its own default skill locations relative to cwd. The framework
    // only POINTS Pi at the skills — discovery/activation stays Pi's job.
    const additionalSkillPaths: string[] = [];
    const conventionalSkillsDir = join(projectRoot, 'skills');
    if (existsSync(conventionalSkillsDir)) {
      additionalSkillPaths.push(conventionalSkillsDir);
    }

    const loader = new DefaultResourceLoader({
      cwd: projectRoot,
      agentDir: getAgentDir(),
      additionalSkillPaths,
      noExtensions: true,
      noThemes: true,
      noPromptTemplates: true,
    });
    await loader.reload();
    this.loaderCache.set(projectRoot, loader);
    return loader;
  }
}
