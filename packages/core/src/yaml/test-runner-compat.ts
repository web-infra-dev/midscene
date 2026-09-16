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

/** Translate known syntax; defer ActionSpace-dependent grammar to the YAML host. */
export function compileLegacyFlowItem(
  flowItem: MidsceneYamlFlowItem,
  actionSpace: readonly LegacyYamlActionIdentity[] = [],
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
    const { aiKeyboardPress, ...options } = raw;
    const prompt = options.locate
      ? options.locate
      : options.keyName
        ? aiKeyboardPress
        : undefined;
    const keyName = options.locate
      ? aiKeyboardPress
      : options.keyName || aiKeyboardPress;
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
    const { aiScroll, locate, ...options } = raw;
    return step('aiScroll', {
      prompt: locate ?? aiScroll ?? undefined,
      options,
    });
  }
  if ('aiTap' in flow) {
    const { aiTap, prompt, locate, ...tapOptions } = raw;
    const nested =
      locate ??
      (typeof aiTap === 'object' && aiTap !== null ? aiTap.locate : undefined);
    let locatePrompt: any;
    let options = tapOptions;
    if (typeof aiTap === 'string' && aiTap) {
      locatePrompt = aiTap;
    } else if (nested && typeof nested === 'object' && nested.prompt) {
      const { prompt: nestedPrompt, ...nestedOptions } = nested;
      locatePrompt = nestedPrompt;
      options = { ...nestedOptions, ...tapOptions };
    } else {
      locatePrompt = aiTap?.prompt || prompt || nested;
    }
    return locatePrompt
      ? step('aiTap', { prompt: locatePrompt, options })
      : invalid('missing prompt for aiTap');
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
