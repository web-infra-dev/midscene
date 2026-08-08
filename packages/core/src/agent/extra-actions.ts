import { readFile } from 'node:fs/promises';
import { findAllMidsceneLocatorField } from '@/ai-model';
import type { DeviceAction, PlanningAction } from '@/types';
import yaml from 'js-yaml';

interface ExtraActionFile {
  name: string;
  actionName: string;
  actionParam: [unknown];
}

export interface LoadedExtraAction {
  name: string;
  planningAction: DeviceAction;
  plan: PlanningAction;
}

const locatorShortcutFields = new Set([
  'prompt',
  'xpath',
  'locatedPixelBbox',
  'deepLocate',
  'deepThink',
  'cacheable',
]);

const hasInvalidProtocolNameCharacter = (name: string): boolean =>
  Array.from(name).some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      character === '<' ||
      character === '>' ||
      codePoint === undefined ||
      codePoint < 0x20 ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x2028 ||
      codePoint === 0x2029
    );
  });

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function assertNonEmptyString(
  value: unknown,
  field: 'name' | 'actionName',
  sourcePath: string,
): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(
      `Invalid extra action file "${sourcePath}": "${field}" must be a non-empty string`,
    );
  }
}

function parseExtraActionFile(
  content: string,
  sourcePath: string,
): ExtraActionFile {
  let parsed: unknown;
  try {
    parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
  } catch (error) {
    throw new Error(
      `Failed to parse extra action file "${sourcePath}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }

  if (!isPlainObject(parsed)) {
    throw new Error(
      `Invalid extra action file "${sourcePath}": expected a YAML object`,
    );
  }

  assertNonEmptyString(parsed.name, 'name', sourcePath);
  assertNonEmptyString(parsed.actionName, 'actionName', sourcePath);
  if (hasInvalidProtocolNameCharacter(parsed.name)) {
    throw new Error(
      `Invalid extra action file "${sourcePath}": "name" must not contain angle brackets, line breaks, or control characters`,
    );
  }
  if (!Array.isArray(parsed.actionParam) || parsed.actionParam.length !== 1) {
    throw new Error(
      `Invalid extra action file "${sourcePath}": "actionParam" must contain exactly one item because each extra action represents one device operation`,
    );
  }

  return {
    name: parsed.name.trim(),
    actionName: parsed.actionName.trim(),
    actionParam: [parsed.actionParam[0]],
  };
}

function findReferencedAction(
  actionName: string,
  actionSpace: DeviceAction[],
  sourcePath: string,
): DeviceAction {
  const exactMatch = actionSpace.find(
    (action) =>
      action.name === actionName || action.interfaceAlias === actionName,
  );
  if (exactMatch) {
    return exactMatch;
  }

  const normalizedName = actionName.toLowerCase();
  const caseInsensitiveMatch = actionSpace.find(
    (action) =>
      action.name.toLowerCase() === normalizedName ||
      action.interfaceAlias?.toLowerCase() === normalizedName,
  );
  if (caseInsensitiveMatch) {
    return caseInsensitiveMatch;
  }

  const availableActions = actionSpace
    .flatMap((action) => [action.name, action.interfaceAlias])
    .filter(Boolean)
    .join(', ');
  throw new Error(
    `Invalid extra action file "${sourcePath}": action "${actionName}" is not in the current action space. Available actions: ${availableActions || '(none)'}`,
  );
}

function normalizeActionParam(
  action: DeviceAction,
  actionParam: unknown,
  fallbackPrompt: string,
): unknown {
  if (!action.paramSchema || !isPlainObject(actionParam)) {
    return actionParam;
  }

  const locateFields = findAllMidsceneLocatorField(action.paramSchema);
  if (locateFields.length !== 1) {
    return actionParam;
  }

  const locateField = locateFields[0];
  if (Object.prototype.hasOwnProperty.call(actionParam, locateField)) {
    const locateParam = actionParam[locateField];
    if (
      isPlainObject(locateParam) &&
      (locateParam.xpath || locateParam.locatedPixelBbox) &&
      !locateParam.prompt
    ) {
      return {
        ...actionParam,
        [locateField]: {
          prompt: fallbackPrompt,
          ...locateParam,
        },
      };
    }
    return actionParam;
  }

  const isLocatorShortcut =
    Object.prototype.hasOwnProperty.call(actionParam, 'prompt') ||
    Object.prototype.hasOwnProperty.call(actionParam, 'xpath') ||
    Object.prototype.hasOwnProperty.call(actionParam, 'locatedPixelBbox');
  if (!isLocatorShortcut) {
    return actionParam;
  }

  const locateParam: Record<string, unknown> = {};
  const actionParamWithoutLocate: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(actionParam)) {
    if (locatorShortcutFields.has(key)) {
      locateParam[key] = value;
    } else {
      actionParamWithoutLocate[key] = value;
    }
  }

  return {
    ...actionParamWithoutLocate,
    [locateField]: {
      ...(!locateParam.prompt ? { prompt: fallbackPrompt } : {}),
      ...locateParam,
    },
  };
}

function validateActionParam(
  action: DeviceAction,
  actionParam: unknown,
  sourcePath: string,
  actionIndex: number,
): unknown {
  if (!action.paramSchema) {
    return actionParam;
  }

  const result = action.paramSchema.safeParse(actionParam);
  if (result.success) {
    return result.data;
  }

  const details = result.error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${field}: ${issue.message}`;
    })
    .join('; ');
  throw new Error(
    `Invalid extra action file "${sourcePath}": "actionParam[${actionIndex}]" does not match action "${action.name}": ${details}`,
  );
}

function createPlanningAction(id: string, name: string): DeviceAction {
  return {
    name: id,
    description: `Replay the known-good UI action ${JSON.stringify(name)}. If the user's request matches this action, always prefer it over rebuilding the operation from a low-level action. This action takes no parameters.`,
    sample: {},
    call: () => {
      throw new Error(
        `Extra action "${name}" must be expanded before execution`,
      );
    },
  };
}

export async function loadExtraActions(
  paths: string[],
  actionSpace: DeviceAction[],
): Promise<LoadedExtraAction[]> {
  if (paths.length === 0) {
    return [];
  }

  const loadedActions: LoadedExtraAction[] = [];
  const knownNames = new Set(actionSpace.map((action) => action.name));
  const knownProtocolIds = new Set(knownNames);

  for (const sourcePath of paths) {
    let content: string;
    try {
      content = await readFile(sourcePath, 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to read extra action file "${sourcePath}": ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }

    const definition = parseExtraActionFile(content, sourcePath);
    if (knownNames.has(definition.name)) {
      throw new Error(
        `Invalid extra action file "${sourcePath}": action name "${definition.name}" conflicts with another action`,
      );
    }

    const referencedAction = findReferencedAction(
      definition.actionName,
      actionSpace,
      sourcePath,
    );
    knownNames.add(definition.name);
    let protocolIndex = loadedActions.length + 1;
    let protocolId = `MidsceneExtraAction_${protocolIndex}`;
    while (knownProtocolIds.has(protocolId)) {
      protocolIndex += 1;
      protocolId = `MidsceneExtraAction_${protocolIndex}`;
    }
    knownProtocolIds.add(protocolId);

    const normalizedParam = normalizeActionParam(
      referencedAction,
      definition.actionParam[0],
      definition.name,
    );
    const plan = {
      type: referencedAction.name,
      param: validateActionParam(
        referencedAction,
        normalizedParam,
        sourcePath,
        0,
      ),
      thought: `Run extra action "${definition.name}"`,
    };

    loadedActions.push({
      name: definition.name,
      planningAction: createPlanningAction(protocolId, definition.name),
      plan,
    });
  }

  return loadedActions;
}

export function expandExtraActionPlans(
  plans: PlanningAction[],
  extraActions: LoadedExtraAction[],
): PlanningAction[] {
  if (extraActions.length === 0) {
    return plans;
  }

  const extraActionsByName = new Map(
    extraActions.map((action) => [action.planningAction.name, action]),
  );

  return plans.map((plan) => {
    const extraAction = extraActionsByName.get(plan.type);
    if (!extraAction) {
      return plan;
    }

    return {
      ...extraAction.plan,
      param: structuredClone(extraAction.plan.param),
      thought: plan.thought || extraAction.plan.thought,
    };
  });
}

export function extraActionsCacheKey(
  extraActions: LoadedExtraAction[],
): string | undefined {
  if (extraActions.length === 0) {
    return undefined;
  }

  return JSON.stringify(
    extraActions.map((action) => ({
      name: action.name,
      plan: action.plan,
    })),
  );
}

export function createExtraActionExecutionOptions(
  extraActions: LoadedExtraAction[],
) {
  if (extraActions.length === 0) {
    return undefined;
  }

  const extraActionNames = new Set(
    extraActions.map((action) => action.planningAction.name),
  );
  return {
    actionSpace: extraActions.map((action) => action.planningAction),
    expandPlans: (plans: PlanningAction[]) => ({
      plans: expandExtraActionPlans(plans, extraActions),
      expanded: plans.some((plan) => extraActionNames.has(plan.type)),
    }),
  };
}
