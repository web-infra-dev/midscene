import type { TUserPrompt } from '@/common';
import type {
  MidsceneYamlFlowItem,
  MidsceneYamlScript,
  MidsceneYamlTask,
} from '@/types';
import { type ZodTypeAny, z } from 'zod';
import type {
  CollectedCase,
  CollectedWorkflowDocument,
  NormalizedStep,
} from '../test-runner';
import {
  buildDetailedLocateParam,
  buildDetailedLocateParamAndRestParams,
} from './utils';

export interface LegacyYamlActionIdentity {
  name: string;
  interfaceAlias?: string;
  paramSchema?: ZodTypeAny;
}

const isStringParamSchema = (schema?: ZodTypeAny): boolean => {
  if (!schema) return false;

  const schemaDef = (schema as any)?._def;
  if (!schemaDef?.typeName) return false;

  switch (schemaDef.typeName) {
    case z.ZodFirstPartyTypeKind.ZodString:
    case z.ZodFirstPartyTypeKind.ZodEnum:
    case z.ZodFirstPartyTypeKind.ZodNativeEnum:
      return true;
    case z.ZodFirstPartyTypeKind.ZodLiteral:
      return typeof schemaDef.value === 'string';
    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodNullable:
    case z.ZodFirstPartyTypeKind.ZodDefault:
      return isStringParamSchema(schemaDef.innerType);
    case z.ZodFirstPartyTypeKind.ZodEffects:
      return isStringParamSchema(schemaDef.schema);
    case z.ZodFirstPartyTypeKind.ZodPipeline:
      return isStringParamSchema(schemaDef.out);
    case z.ZodFirstPartyTypeKind.ZodUnion: {
      const options = schemaDef.options as ZodTypeAny[] | undefined;
      return Array.isArray(options)
        ? options.every((option) => isStringParamSchema(option))
        : false;
    }
    default:
      return false;
  }
};

const buildShortcutActionParam = (
  actionName: string,
  interfaceAlias: string | undefined,
  value: string,
) => {
  if (actionName === 'Launch' || interfaceAlias === 'launch') {
    return { uri: value };
  }

  if (actionName === 'Terminate' || interfaceAlias === 'terminate') {
    return { uri: value };
  }

  if (
    actionName === 'RunAdbShell' ||
    interfaceAlias === 'runAdbShell' ||
    actionName === 'RunHdcShell' ||
    interfaceAlias === 'runHdcShell'
  ) {
    return { command: value };
  }

  return undefined;
};

class DuplicateImageFieldError extends Error {}

function assertNoDuplicateImageFields(
  prompt: Record<string, any>,
  options: Record<string, any>,
) {
  for (const field of ['images', 'convertHttpImage2Base64']) {
    if (prompt[field] !== undefined && options[field] !== undefined) {
      throw new DuplicateImageFieldError(
        `Duplicate ${field} in YAML locate input. Specify it in only one place.`,
      );
    }
  }
}

// Older YAML steps can carry reference images alongside the locate prompt.
function normalizeLegacyLocateInput(
  prompt: TUserPrompt | undefined,
  rawOptions: Record<string, any>,
) {
  const { images, convertHttpImage2Base64, ...options } = rawOptions;
  // Targetless actions used to ignore image fields. Do not pass them through
  // to the SDK, where image fields in locate options are now rejected.
  if (!prompt) {
    return { prompt, options };
  }
  if (typeof prompt === 'object') {
    assertNoDuplicateImageFields(prompt, rawOptions);
  }
  if (images === undefined && convertHttpImage2Base64 === undefined) {
    return { prompt, options };
  }
  return {
    prompt: {
      ...(typeof prompt === 'string' ? { prompt } : prompt),
      ...(images !== undefined && { images }),
      ...(convertHttpImage2Base64 !== undefined && { convertHttpImage2Base64 }),
    },
    options,
  };
}

/** Translate known syntax; defer ActionSpace-dependent grammar to the YAML host. */
export function compileLegacyFlowItem(
  flowItem: MidsceneYamlFlowItem,
  actionSpace: readonly LegacyYamlActionIdentity[] = [],
): NormalizedStep {
  try {
    return compileLegacyFlowItemInternal(flowItem, actionSpace);
  } catch (error) {
    if (!(error instanceof DuplicateImageFieldError)) {
      throw error;
    }
    // Reject duplicate fields at Step execution, preserving task continuation
    // and reporting instead of aborting document collection or Agent setup.
    return {
      node: 'legacyValidationError',
      input: { message: error.message },
      meta: { continueOnError: false },
    };
  }
}

function compileLegacyFlowItemInternal(
  flowItem: MidsceneYamlFlowItem,
  actionSpace: readonly LegacyYamlActionIdentity[],
): NormalizedStep {
  if (
    typeof flowItem !== 'object' ||
    flowItem === null ||
    Array.isArray(flowItem)
  )
    return {
      node: 'legacyValidationError',
      input: { message: 'flow item must be an object' },
      meta: { continueOnError: false },
    };
  const raw = flowItem as Record<string, any>;
  const { name, ...flow } = raw;
  const step = (
    node: string,
    input: Record<string, unknown>,
    captureResult = false,
  ): NormalizedStep => ({
    node,
    input,
    meta: {
      continueOnError: false,
      ...(captureResult
        ? {
            captureResult: true,
            ...(typeof name === 'string' && name.length > 0
              ? { resultName: name }
              : {}),
          }
        : {}),
    },
  });
  const invalid = (message: string) =>
    step('legacyValidationError', { message });
  if ('Finalize' in flow) return step('Finalize', {});
  if ('aiAct' in flow || 'aiAction' in flow || 'ai' in flow) {
    const { aiAct, aiAction, ai, instruction, ...options } = raw;
    const actionPrompt = aiAct ?? aiAction ?? ai;
    const hasPrompt = (value: any) =>
      (typeof value === 'string' && value) ||
      (value &&
        typeof value === 'object' &&
        typeof value.prompt === 'string' &&
        value.prompt);
    const prompt = hasPrompt(instruction)
      ? instruction
      : hasPrompt(actionPrompt)
        ? actionPrompt
        : undefined;
    return prompt
      ? step('aiAct', { prompt, options })
      : invalid('missing prompt for ai (aiAct)');
  }
  if ('runGherkinScenario' in flow) {
    return flow.runGherkinScenario
      ? step('runGherkinScenario', {
          scenario: flow.runGherkinScenario,
          options: { cacheable: false },
        })
      : invalid('missing scenario for runGherkinScenario');
  }
  if ('aiAssert' in flow) {
    const { aiAssert: prompt, errorMessage: message, ...options } = flow;
    if (!prompt) return invalid('missing prompt for aiAssert');
    if (Object.hasOwn(raw, 'observe'))
      return invalid(
        '`observe` is not supported in YAML aiAssert. Use agent.startObserving() from code instead.',
      );
    return step(
      'aiAssert',
      {
        prompt,
        options: { ...options, keepRawResponse: true },
        message,
      },
      true,
    );
  }
  for (const node of [
    'aiQuery',
    'aiNumber',
    'aiString',
    'aiBoolean',
    'aiAsk',
    'aiLocate',
  ]) {
    if (node in flow) {
      const { [node]: prompt, ...options } = flow;
      if (!prompt) return invalid(`missing prompt for ${node}`);
      if (Object.hasOwn(raw, 'observe'))
        return invalid(
          '`observe` is not supported in YAML flow items. Use agent.startObserving() from code instead.',
        );
      if (node === 'aiLocate') {
        return step(node, normalizeLegacyLocateInput(prompt, options), true);
      }
      return step(node, { prompt, options }, true);
    }
  }
  if ('aiWaitFor' in flow) {
    const { aiWaitFor: prompt, timeout, ...options } = raw;
    if (!prompt) return invalid('missing prompt for aiWaitFor');
    return step('aiWaitFor', {
      prompt,
      options: {
        ...options,
        ...(timeout === undefined ? {} : { timeout, timeoutMs: timeout }),
      },
    });
  }
  if ('sleep' in flow) {
    const ms =
      typeof flow.sleep === 'string'
        ? Number.parseInt(flow.sleep, 10)
        : flow.sleep;
    // The old player rejected invalid sleep only when execution reached it.
    // Keep both that timing and its error message inside the YAML boundary.
    if (!Number.isFinite(ms) || ms <= 0)
      return invalid(
        `ms for sleep must be greater than 0, but got ${flow.sleep}`,
      );
    return step('sleep', { ms });
  }
  if ('javascript' in flow)
    return step('javascript', { script: flow.javascript }, true);
  if ('recordToReport' in flow || 'logScreenshot' in flow)
    return step('recordToReport', {
      title: flow.recordToReport ?? flow.logScreenshot ?? 'untitled',
      options: { content: flow.content || '' },
    });
  if ('aiInput' in flow) {
    const { aiInput, value: rawValue, ...options } = raw;
    const prompt = options.locate || aiInput || '';
    const value = options.locate ? aiInput || rawValue : rawValue;
    const input = normalizeLegacyLocateInput(prompt, options);
    return step('action', {
      name: 'Input',
      params: {
        ...input.options,
        ...(value === undefined ? {} : { value: String(value) }),
        ...(input.prompt
          ? { locate: buildDetailedLocateParam(input.prompt, input.options) }
          : {}),
      },
    });
  }
  if ('aiKeyboardPress' in flow) {
    const { aiKeyboardPress, ...options } = raw;
    const prompt = options.locate
      ? options.locate
      : options.keyName
        ? aiKeyboardPress
        : undefined;
    const keyName = options.locate
      ? aiKeyboardPress
      : options.keyName || aiKeyboardPress;
    const input = normalizeLegacyLocateInput(prompt, options);
    return step('action', {
      name: 'KeyboardPress',
      params: {
        ...input.options,
        ...(keyName ? { keyName } : {}),
        ...(input.prompt
          ? { locate: buildDetailedLocateParam(input.prompt, input.options) }
          : {}),
      },
    });
  }
  if ('aiScroll' in flow) {
    const { aiScroll, locate, prompt, ...options } = raw;
    return step(
      'aiScroll',
      normalizeLegacyLocateInput(
        (locate ?? aiScroll) || prompt || undefined,
        options,
      ),
    );
  }
  if ('aiTap' in flow) {
    const { aiTap, prompt, locate, ...tapOptions } = raw;
    const nested =
      locate ??
      (typeof aiTap === 'object' && aiTap !== null ? aiTap.locate : undefined);
    if (
      !(typeof aiTap === 'string' && aiTap) &&
      nested &&
      typeof nested === 'object' &&
      nested.prompt &&
      typeof nested.prompt !== 'string'
    ) {
      return invalid(
        'aiTap locate.prompt must be a string. Put images alongside locate.prompt, not inside another prompt object.',
      );
    }
    const { prompt: locatePrompt, options } = (() => {
      if (typeof aiTap === 'string' && aiTap) {
        return { prompt: aiTap, options: tapOptions };
      }
      if (nested && typeof nested === 'object' && nested.prompt) {
        const { prompt: nestedPrompt, ...nestedOptions } = nested;
        assertNoDuplicateImageFields(nestedOptions, tapOptions);
        return normalizeLegacyLocateInput(nestedPrompt, {
          ...nestedOptions,
          ...tapOptions,
        });
      }
      if (
        aiTap &&
        typeof aiTap === 'object' &&
        typeof aiTap.prompt === 'string' &&
        aiTap.prompt
      ) {
        // Keep structured image prompts intact; prompt-only objects retain
        // the normalized string form used by cached-plan inputs.
        return {
          prompt:
            Object.hasOwn(aiTap, 'images') ||
            Object.hasOwn(aiTap, 'convertHttpImage2Base64')
              ? aiTap
              : aiTap.prompt,
          options: tapOptions,
        };
      }
      return { prompt: prompt || nested, options: tapOptions };
    })();
    if (!locatePrompt) {
      return invalid('missing prompt for aiTap');
    }
    return step('aiTap', normalizeLegacyLocateInput(locatePrompt, options));
  }
  if (typeof flow.runAdbShell === 'string' && typeof flow.timeout === 'number')
    return step(
      'runAdbShell',
      { command: flow.runAdbShell, timeout: flow.timeout },
      true,
    );
  const action = actionSpace.find(
    (item) =>
      (item.interfaceAlias && Object.hasOwn(flow, item.interfaceAlias)) ||
      Object.hasOwn(flow, item.name),
  );
  if (!action) return step('legacyAction', { flow }, true);
  const key =
    action?.interfaceAlias && Object.hasOwn(flow, action.interfaceAlias)
      ? action.interfaceAlias
      : action.name;
  const value = flow[key];
  if (typeof value === 'string') {
    const shortcut = buildShortcutActionParam(
      action.name,
      action.interfaceAlias,
      value,
    );
    if (shortcut)
      return step(
        'action',
        {
          name: action.name,
          params: shortcut,
        },
        true,
      );
    if (isStringParamSchema(action.paramSchema))
      return step('action', { name: action.name, params: value }, true);
  }
  const { prompt, ...options } =
    value && typeof value === 'object' ? value : flow;
  const locatePrompt =
    typeof value === 'string' && value ? value : prompt || options.locate;
  const input = normalizeLegacyLocateInput(locatePrompt, options);
  const { locateParam, restParams } = buildDetailedLocateParamAndRestParams(
    input.prompt ?? '',
    input.options,
    [action.name, action.interfaceAlias ?? ''],
  );
  return step(
    'action',
    { name: action.name, params: { ...restParams, locate: locateParam } },
    true,
  );
}

const legacyDocumentId = (sourcePath: string): string =>
  `legacy-yaml:${sourcePath}`;

/** Compile one legacy task into a Runner Case with its original task index. */
export const collectLegacyYamlTask = (
  task: MidsceneYamlTask,
  taskIndex: number,
  sourcePath = '<inline-yaml>',
  actionSpace: readonly LegacyYamlActionIdentity[] = [],
): CollectedCase => {
  const documentId = legacyDocumentId(sourcePath);
  const projectId = 'legacy-yaml';
  return {
    caseId: `${documentId}:task:${taskIndex}`,
    projectId,
    sourcePath,
    caseIndex: taskIndex,
    definition: {
      name: task.name,
      onFailure: task.continueOnError ? 'continue' : 'stop-document',
      steps: Array.isArray(task.flow)
        ? task.flow.map((flowItem) =>
            compileLegacyFlowItem(flowItem, actionSpace),
          )
        : [
            {
              node: 'legacyValidationError',
              input: { message: 'missing flow in task' },
              meta: { continueOnError: false },
            },
          ],
    },
  };
};

const legacyYamlDocument = (
  sourcePath: string,
  cases: CollectedCase[],
): CollectedWorkflowDocument => ({
  documentId: legacyDocumentId(sourcePath),
  projectId: 'legacy-yaml',
  sourcePath,
  lifecycle: {
    beforeAll: [],
    beforeEach: [],
    afterEach: [],
    afterAll: [],
  },
  cases,
});

/** Compile one legacy task into a one-Case Runner document. */
export const collectLegacyYamlTaskDocument = (
  task: MidsceneYamlTask,
  taskIndex: number,
  sourcePath = '<inline-yaml>',
  actionSpace: readonly LegacyYamlActionIdentity[] = [],
): CollectedWorkflowDocument =>
  legacyYamlDocument(sourcePath, [
    collectLegacyYamlTask(task, taskIndex, sourcePath, actionSpace),
  ]);

/** Compile the legacy tasks/flow shape into the Runner document/case/step IR. */
export const collectLegacyYamlDocument = (
  script: MidsceneYamlScript,
  sourcePath = '<inline-yaml>',
  actionSpace: readonly LegacyYamlActionIdentity[] = [],
  identity?: CollectedWorkflowDocument,
): CollectedWorkflowDocument => {
  const document = legacyYamlDocument(
    sourcePath,
    (script.tasks ?? []).map((task, taskIndex) =>
      collectLegacyYamlTask(task, taskIndex, sourcePath, actionSpace),
    ),
  );
  if (!identity) return document;
  return {
    ...document,
    documentId: identity.documentId,
    projectId: identity.projectId,
    cases: document.cases.map((item) => ({
      ...item,
      projectId: identity.projectId,
      caseId: identity.cases.find(
        (original) => original.caseIndex === item.caseIndex,
      )!.caseId,
    })),
  };
};
