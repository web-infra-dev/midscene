import type {
  MidsceneYamlFlowItem,
  MidsceneYamlScript,
  MidsceneYamlTask,
} from '@/types';
import { assert } from '@midscene/shared/utils';
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

/** Translate syntax once. Execution only sees public Node inputs. */
export function compileLegacyFlowItem(
  flowItem: MidsceneYamlFlowItem,
  actionSpace: readonly LegacyYamlActionIdentity[] = [],
): NormalizedStep {
  const raw = flowItem as Record<string, any>;
  const { name, ...flow } = raw;
  const promptInput = (value: any, options: Record<string, any>) => {
    const { images, convertHttpImage2Base64, ...rest } = options;
    const prompt =
      images !== undefined || convertHttpImage2Base64 !== undefined
        ? {
            ...(typeof value === 'string' ? { prompt: value } : value),
            ...(images === undefined ? {} : { images }),
            ...(convertHttpImage2Base64 === undefined
              ? {}
              : { convertHttpImage2Base64 }),
          }
        : value;
    return { prompt, options: rest };
  };
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
  if ('Finalize' in flow) return step('Finalize', {});
  if ('aiAct' in flow || 'aiAction' in flow || 'ai' in flow) {
    // This historical UI hint was never consumed by Agent.aiAct. Accept it
    // at the YAML boundary without extending the common action contract.
    const {
      aiAct,
      aiAction,
      ai,
      instruction,
      aiActionProgressTips: _tips,
      ...options
    } = flow;
    return step('aiAct', {
      prompt: instruction || aiAct || aiAction || ai,
      options,
    });
  }
  if ('runGherkinScenario' in flow)
    return step('runGherkinScenario', {
      scenario: flow.runGherkinScenario,
      options: { cacheable: false },
    });
  if ('aiAssert' in flow) {
    const { aiAssert: prompt, errorMessage: message, ...options } = flow;
    return step(
      'aiAssert',
      {
        ...promptInput(prompt, { ...options, keepRawResponse: true }),
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
      return step(node, promptInput(prompt, options), true);
    }
  }
  if ('aiWaitFor' in flow) {
    const { aiWaitFor: prompt, timeout, ...options } = flow;
    return step(
      'aiWaitFor',
      promptInput(prompt, {
        ...options,
        ...(timeout === undefined ? {} : { timeoutMs: timeout }),
      }),
    );
  }
  if ('sleep' in flow)
    return step('sleep', {
      ms:
        typeof flow.sleep === 'string'
          ? Number.parseInt(flow.sleep, 10)
          : flow.sleep,
    });
  if ('javascript' in flow)
    return step('javascript', { script: flow.javascript }, true);
  if ('recordToReport' in flow || 'logScreenshot' in flow)
    return step('recordToReport', {
      title: flow.recordToReport ?? flow.logScreenshot ?? 'untitled',
      options: { content: flow.content || '' },
    });
  if ('aiInput' in flow) {
    const { aiInput, value: rawValue, ...options } = flow;
    const prompt = options.locate || aiInput || '';
    const value = options.locate ? aiInput || rawValue : rawValue;
    return step('action', {
      name: 'Input',
      params: {
        ...options,
        ...(value === undefined ? {} : { value: String(value) }),
        ...(prompt
          ? { locate: buildDetailedLocateParam(prompt, options) }
          : {}),
      },
    });
  }
  if ('aiKeyboardPress' in flow) {
    const { aiKeyboardPress, ...options } = flow;
    const prompt =
      options.locate ?? (options.keyName ? aiKeyboardPress : undefined);
    const keyName = options.locate
      ? aiKeyboardPress
      : (options.keyName ?? aiKeyboardPress);
    return step('action', {
      name: 'KeyboardPress',
      params: {
        ...options,
        ...(keyName ? { keyName } : {}),
        ...(prompt
          ? { locate: buildDetailedLocateParam(prompt, options) }
          : {}),
      },
    });
  }
  if ('aiScroll' in flow) {
    const { aiScroll, locate, ...options } = flow;
    return step(
      'aiScroll',
      promptInput(locate ?? aiScroll ?? undefined, options),
    );
  }
  if ('aiTap' in flow) {
    const { aiTap, prompt, locate, ...options } = flow;
    const nested =
      locate ??
      (typeof aiTap === 'object' && aiTap !== null ? aiTap.locate : undefined);
    if (typeof aiTap === 'string' && aiTap)
      return step('aiTap', promptInput(aiTap, options));
    if (
      aiTap &&
      typeof aiTap === 'object' &&
      typeof aiTap.prompt === 'string'
    ) {
      const { prompt: nestedPrompt, ...nestedOptions } = aiTap;
      return step(
        'aiTap',
        promptInput(nestedPrompt, { ...nestedOptions, ...options }),
      );
    }
    if (nested && typeof nested === 'object' && nested.prompt) {
      const { prompt: nestedPrompt, ...nestedOptions } = nested;
      const { images, convertHttpImage2Base64, ...locateOptions } =
        nestedOptions;
      return step('aiTap', {
        prompt: images
          ? {
              prompt: nestedPrompt,
              images,
              ...(convertHttpImage2Base64 === undefined
                ? {}
                : { convertHttpImage2Base64 }),
            }
          : nestedPrompt,
        options: { ...locateOptions, ...options },
      });
    }
    return step(
      'aiTap',
      promptInput(aiTap?.prompt || prompt || nested, options),
    );
  }
  const action = actionSpace.find(
    (item) =>
      (item.interfaceAlias && Object.hasOwn(flow, item.interfaceAlias)) ||
      Object.hasOwn(flow, item.name),
  );
  const key =
    action?.interfaceAlias && Object.hasOwn(flow, action.interfaceAlias)
      ? action.interfaceAlias
      : (action?.name ?? Object.keys(flow)[0]);
  const value = flow[key];
  if (key === 'runAdbShell' && typeof flow.timeout === 'number') {
    // The helper-only timeout can be mapped without acquiring an Android
    // Agent. Other aliases stay on the public action Node and are resolved by
    // the Agent's ActionSpace when the Node executes.
    return step('runAdbShell', { command: value, timeout: flow.timeout }, true);
  }
  if (!action) {
    const siblingParams = Object.fromEntries(
      Object.entries(flow).filter(([item]) => item !== key),
    );
    const params =
      (value === '' || value === undefined) &&
      Object.keys(siblingParams).length > 0
        ? siblingParams
        : value;
    return step('action', { name: key, params }, true);
  }
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
  const prompt = typeof value === 'string' ? value : '';
  const source = prompt
    ? { ...flow, prompt }
    : value && typeof value === 'object'
      ? value
      : flow;
  const { locateParam, restParams } = buildDetailedLocateParamAndRestParams(
    prompt,
    source,
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
  assert(Array.isArray(task.flow), 'missing flow in task');
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
      steps: task.flow.map((flowItem) =>
        compileLegacyFlowItem(flowItem, actionSpace),
      ),
    },
  };
};

const assignLegacyResultNames = (
  cases: readonly CollectedCase[],
): CollectedCase[] => {
  let unnamedResultIndex = 0;
  return cases.map((collectedCase) => ({
    ...collectedCase,
    definition: {
      ...collectedCase.definition,
      steps: collectedCase.definition.steps.map((step) => {
        if (!step.meta.captureResult) return step;
        return {
          ...step,
          meta: {
            ...step.meta,
            resultName: step.meta.resultName ?? String(unnamedResultIndex++),
          },
        };
      }),
    },
  }));
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
  cases: assignLegacyResultNames(cases),
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
