import type { Awaitable } from '../engine/types';
import { NodeDefinitionError, NodeExecutionError } from '../errors';
import { defineDocumentNode, defineNode } from '../node/define-node';
import type {
  DocumentNodeDefinition,
  DocumentNodeExecutionContext,
  NodeDefinition,
  NodeExecutionContext,
} from '../node/types';

export interface MidsceneAiActOptions {
  cacheable?: boolean;
  fileChooserAccept?: string | string[];
  deepThink?: 'unset' | boolean;
  deepLocate?: boolean;
  context?: string;
  abortSignal?: AbortSignal;
}

export interface MidsceneAiAssertOptions {
  domIncluded?: boolean | 'visible-only';
  screenshotIncluded?: boolean;
  context?: string;
  abortSignal?: AbortSignal;
  keepRawResponse?: boolean;
}

export interface MidsceneReportScreenshot {
  base64: string;
  description?: string;
}

export interface MidsceneRecordToReportOptions {
  content?: string;
  screenshotBase64?: string;
  screenshots?: MidsceneReportScreenshot[];
}

export interface MidsceneUIAgent {
  aiAct(
    prompt: string,
    options?: MidsceneAiActOptions,
  ): Promise<string | undefined>;
  aiAssert(
    prompt: string,
    message?: string,
    options?: MidsceneAiAssertOptions,
  ): Promise<unknown>;
  recordToReport(
    title?: string,
    options?: MidsceneRecordToReportOptions,
  ): Promise<unknown>;
}

export interface AiActNodeInput {
  prompt?: string;
  options?: Omit<MidsceneAiActOptions, 'abortSignal'>;
}

export interface AiAssertNodeInput {
  prompt?: string;
  message?: string;
  options?: Omit<MidsceneAiAssertOptions, 'abortSignal' | 'keepRawResponse'>;
}

export interface RecordToReportNodeInput {
  /** String shorthand is normalized into prompt and used as the title. */
  prompt?: string;
  title?: string;
  content?: string;
  screenshotBase64?: string;
  screenshots?: MidsceneReportScreenshot[];
}

export interface CreateMidsceneNodesOptions<TContext> {
  getAgent(
    ctx: NodeExecutionContext<unknown, TContext>,
  ): Awaitable<MidsceneUIAgent>;
}

export interface CreateMidsceneDocumentNodesOptions<TContext> {
  getAgent(
    ctx: DocumentNodeExecutionContext<unknown, TContext>,
  ): Awaitable<MidsceneUIAgent>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validateAllowedKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
) => {
  const allowed = new Set(allowedKeys);
  const unsupported = Object.keys(value).find((key) => !allowed.has(key));
  if (unsupported) {
    throw new TypeError(`${label} has unsupported option "${unsupported}".`);
  }
};

const requirePrompt = (input: { prompt?: string }, node: string): string => {
  if (typeof input.prompt !== 'string' || input.prompt.trim().length === 0) {
    throw new TypeError(`Node "${node}" requires a non-empty prompt.`);
  }
  return input.prompt;
};

function validateOptionalString(
  value: unknown,
  label: string,
): asserts value is string | undefined {
  if (value !== undefined && typeof value !== 'string') {
    throw new TypeError(`${label} must be a string.`);
  }
}

const validateAiActOptions = (
  value: unknown,
): Omit<MidsceneAiActOptions, 'abortSignal'> | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError('aiAct options must be a mapping.');
  validateAllowedKeys(
    value,
    ['cacheable', 'fileChooserAccept', 'deepThink', 'deepLocate', 'context'],
    'aiAct options',
  );
  if (value.cacheable !== undefined && typeof value.cacheable !== 'boolean') {
    throw new TypeError('aiAct options.cacheable must be a boolean.');
  }
  if (
    value.fileChooserAccept !== undefined &&
    typeof value.fileChooserAccept !== 'string' &&
    !(
      Array.isArray(value.fileChooserAccept) &&
      value.fileChooserAccept.every((item) => typeof item === 'string')
    )
  ) {
    throw new TypeError(
      'aiAct options.fileChooserAccept must be a string or string array.',
    );
  }
  if (
    value.deepThink !== undefined &&
    value.deepThink !== 'unset' &&
    typeof value.deepThink !== 'boolean'
  ) {
    throw new TypeError(
      'aiAct options.deepThink must be a boolean or "unset".',
    );
  }
  if (value.deepLocate !== undefined && typeof value.deepLocate !== 'boolean') {
    throw new TypeError('aiAct options.deepLocate must be a boolean.');
  }
  validateOptionalString(value.context, 'aiAct options.context');
  return value as Omit<MidsceneAiActOptions, 'abortSignal'>;
};

const validateAiAssertOptions = (
  value: unknown,
):
  | Omit<MidsceneAiAssertOptions, 'abortSignal' | 'keepRawResponse'>
  | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new TypeError('aiAssert options must be a mapping.');
  }
  validateAllowedKeys(
    value,
    ['domIncluded', 'screenshotIncluded', 'context'],
    'aiAssert options',
  );
  if (
    value.domIncluded !== undefined &&
    value.domIncluded !== 'visible-only' &&
    typeof value.domIncluded !== 'boolean'
  ) {
    throw new TypeError(
      'aiAssert options.domIncluded must be a boolean or "visible-only".',
    );
  }
  if (
    value.screenshotIncluded !== undefined &&
    typeof value.screenshotIncluded !== 'boolean'
  ) {
    throw new TypeError(
      'aiAssert options.screenshotIncluded must be a boolean.',
    );
  }
  validateOptionalString(value.context, 'aiAssert options.context');
  return value as Omit<
    MidsceneAiAssertOptions,
    'abortSignal' | 'keepRawResponse'
  >;
};

const validateReportInput = (
  input: RecordToReportNodeInput,
): {
  title?: string;
  options: MidsceneRecordToReportOptions;
} => {
  validateOptionalString(input.prompt, 'recordToReport prompt');
  validateOptionalString(input.title, 'recordToReport title');
  validateOptionalString(input.content, 'recordToReport content');
  validateOptionalString(
    input.screenshotBase64,
    'recordToReport screenshotBase64',
  );
  if (input.prompt !== undefined && input.title !== undefined) {
    throw new TypeError(
      'recordToReport accepts either string shorthand or title, not both.',
    );
  }
  if (input.screenshots !== undefined) {
    if (!Array.isArray(input.screenshots) || input.screenshots.length === 0) {
      throw new TypeError(
        'recordToReport screenshots must be a non-empty array.',
      );
    }
    for (const [index, screenshot] of input.screenshots.entries()) {
      if (
        !isRecord(screenshot) ||
        typeof screenshot.base64 !== 'string' ||
        screenshot.base64.length === 0
      ) {
        throw new TypeError(
          `recordToReport screenshot ${index + 1} requires base64.`,
        );
      }
      validateAllowedKeys(
        screenshot,
        ['base64', 'description'],
        `recordToReport screenshot ${index + 1}`,
      );
      validateOptionalString(
        screenshot.description,
        `recordToReport screenshot ${index + 1} description`,
      );
    }
  }
  if (input.screenshotBase64 !== undefined && input.screenshots !== undefined) {
    throw new TypeError(
      'recordToReport accepts either screenshotBase64 or screenshots, not both.',
    );
  }

  return {
    ...((input.title ?? input.prompt)
      ? { title: input.title ?? input.prompt }
      : {}),
    options: {
      ...(input.content === undefined ? {} : { content: input.content }),
      ...(input.screenshotBase64 === undefined
        ? {}
        : { screenshotBase64: input.screenshotBase64 }),
      ...(input.screenshots === undefined
        ? {}
        : { screenshots: input.screenshots }),
    },
  };
};

const requireAgentMethod = <TMethod extends keyof MidsceneUIAgent>(
  agent: MidsceneUIAgent,
  method: TMethod,
  node: string,
): MidsceneUIAgent[TMethod] => {
  if (!isRecord(agent) || typeof agent[method] !== 'function') {
    throw new NodeExecutionError(
      node,
      new TypeError(`getAgent() must return an Agent with ${method}().`),
    );
  }
  return agent[method];
};

export function createMidsceneNodes<TContext>(
  options: CreateMidsceneNodesOptions<TContext>,
): readonly NodeDefinition<any, any, TContext>[] {
  if (!options || typeof options !== 'object') {
    throw new NodeDefinitionError(
      'createMidsceneNodes() options must be an object.',
    );
  }
  if (typeof options.getAgent !== 'function') {
    throw new NodeDefinitionError(
      'createMidsceneNodes() requires a getAgent function.',
    );
  }

  return [
    defineNode<AiActNodeInput, unknown, TContext>({
      name: 'aiAct',
      async execute(ctx) {
        const prompt = requirePrompt(ctx.input, 'aiAct');
        const nodeOptions = validateAiActOptions(ctx.input.options);
        const agent = await options.getAgent(ctx);
        const aiAct = requireAgentMethod(agent, 'aiAct', 'aiAct');
        const output = await aiAct.call(agent, prompt, {
          ...nodeOptions,
          abortSignal: ctx.signal,
        });
        return output === undefined ? undefined : { summary: output };
      },
    }),
    defineNode<AiAssertNodeInput, unknown, TContext>({
      name: 'aiAssert',
      async execute(ctx) {
        const prompt = requirePrompt(ctx.input, 'aiAssert');
        validateOptionalString(ctx.input.message, 'aiAssert message');
        const nodeOptions = validateAiAssertOptions(ctx.input.options);
        const agent = await options.getAgent(ctx);
        const aiAssert = requireAgentMethod(agent, 'aiAssert', 'aiAssert');
        await aiAssert.call(agent, prompt, ctx.input.message, {
          ...nodeOptions,
          abortSignal: ctx.signal,
        });
        return { summary: `Assertion passed: ${prompt}` };
      },
    }),
    defineNode<RecordToReportNodeInput, unknown, TContext>({
      name: 'recordToReport',
      async execute(ctx) {
        const { title, options: reportOptions } = validateReportInput(
          ctx.input,
        );
        const agent = await options.getAgent(ctx);
        const recordToReport = requireAgentMethod(
          agent,
          'recordToReport',
          'recordToReport',
        );
        await recordToReport.call(agent, title, reportOptions);
        return { summary: `Recorded to report: ${title ?? 'untitled'}` };
      },
    }),
  ];
}

export function createMidsceneDocumentNodes<TContext>(
  options: CreateMidsceneDocumentNodesOptions<TContext>,
): readonly DocumentNodeDefinition<any, any, TContext>[] {
  if (!options || typeof options !== 'object') {
    throw new NodeDefinitionError(
      'createMidsceneDocumentNodes() options must be an object.',
    );
  }
  if (typeof options.getAgent !== 'function') {
    throw new NodeDefinitionError(
      'createMidsceneDocumentNodes() requires a getAgent function.',
    );
  }

  return [
    defineDocumentNode<AiActNodeInput, unknown, TContext>({
      name: 'aiAct',
      async execute(ctx) {
        const prompt = requirePrompt(ctx.input, 'aiAct');
        const nodeOptions = validateAiActOptions(ctx.input.options);
        const agent = await options.getAgent(ctx);
        const aiAct = requireAgentMethod(agent, 'aiAct', 'aiAct');
        const output = await aiAct.call(agent, prompt, {
          ...nodeOptions,
          abortSignal: ctx.signal,
        });
        return output === undefined ? undefined : { summary: output };
      },
    }),
    defineDocumentNode<AiAssertNodeInput, unknown, TContext>({
      name: 'aiAssert',
      async execute(ctx) {
        const prompt = requirePrompt(ctx.input, 'aiAssert');
        validateOptionalString(ctx.input.message, 'aiAssert message');
        const nodeOptions = validateAiAssertOptions(ctx.input.options);
        const agent = await options.getAgent(ctx);
        const aiAssert = requireAgentMethod(agent, 'aiAssert', 'aiAssert');
        await aiAssert.call(agent, prompt, ctx.input.message, {
          ...nodeOptions,
          abortSignal: ctx.signal,
        });
        return { summary: `Assertion passed: ${prompt}` };
      },
    }),
    defineDocumentNode<RecordToReportNodeInput, unknown, TContext>({
      name: 'recordToReport',
      async execute(ctx) {
        const { title, options: reportOptions } = validateReportInput(
          ctx.input,
        );
        const agent = await options.getAgent(ctx);
        const recordToReport = requireAgentMethod(
          agent,
          'recordToReport',
          'recordToReport',
        );
        await recordToReport.call(agent, title, reportOptions);
        return { summary: `Recorded to report: ${title ?? 'untitled'}` };
      },
    }),
  ];
}
