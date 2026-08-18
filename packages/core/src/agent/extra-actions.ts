import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { findAllMidsceneLocatorField } from '@/ai-model';
import type { AbstractInterface } from '@/device';
import type { LocatorTarget } from '@/locator';
import type { DeviceAction, PlanningAction } from '@/types';
import {
  type ExtraActionDefinition,
  type ExtraActionManifest,
  parseExtraActionFile,
} from './extra-action-manifest';

export type { ExtraActionDefinition, ExtraActionManifest };

export interface LoadedExtraAction {
  alias: string;
  name: string;
  sourcePath: string;
  plan: PlanningAction;
  validWhenTargetExists?: LocatorTarget;
}

export interface ExtraActionSource {
  type: 'extra-action';
  name: string;
  alias: string;
  sourcePath: string;
}

export interface ExtraActionSnapshot {
  readonly actionSpace: readonly DeviceAction[];
  readonly fingerprint: string;
  expandPlans: (plans: PlanningAction[]) => {
    plans: PlanningAction[];
    expanded: boolean;
  };
}

const extraActionSourceByPlan = new WeakMap<
  PlanningAction,
  ExtraActionSource
>();

export function getExtraActionSource(
  plan: PlanningAction,
): ExtraActionSource | undefined {
  return extraActionSourceByPlan.get(plan);
}

export function setExtraActionSource(
  plan: PlanningAction,
  source: ExtraActionSource,
): void {
  extraActionSourceByPlan.set(plan, source);
}

const locatorShortcutFields = new Set([
  'prompt',
  'xpath',
  'target',
  'locatedPixelBbox',
  'deepLocate',
  'deepThink',
  'cacheable',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function findReferencedAction(
  actionName: string,
  actionSpace: DeviceAction[],
  sourcePath: string,
): DeviceAction {
  const exactMatch = actionSpace.find(
    (action) =>
      action.name === actionName || action.interfaceAlias === actionName,
  );
  if (exactMatch) return exactMatch;

  const normalizedName = actionName.toLowerCase();
  const caseInsensitiveMatches = actionSpace.filter(
    (action) =>
      action.name.toLowerCase() === normalizedName ||
      action.interfaceAlias?.toLowerCase() === normalizedName,
  );
  if (caseInsensitiveMatches.length === 1) return caseInsensitiveMatches[0];
  if (caseInsensitiveMatches.length > 1) {
    throw new Error(
      `Invalid extra action file "${sourcePath}": action "${actionName}" is ambiguous. Matching actions: ${caseInsensitiveMatches
        .map((action) => action.name)
        .join(', ')}`,
    );
  }

  const availableActions = actionSpace
    .flatMap((action) => [action.name, action.interfaceAlias])
    .filter(Boolean)
    .join(', ');
  throw new Error(
    `Invalid extra action file "${sourcePath}": action "${actionName}" is not in the current action space. Available actions: ${availableActions || '(none)'}`,
  );
}

function normalizeLegacyActionParam(
  action: DeviceAction,
  actionParam: unknown,
  fallbackPrompt: string,
): unknown {
  if (!action.paramSchema || !isPlainObject(actionParam)) {
    return actionParam;
  }
  const locateFields = findAllMidsceneLocatorField(action.paramSchema);
  if (locateFields.length !== 1) return actionParam;

  const locateField = locateFields[0];
  if (Object.prototype.hasOwnProperty.call(actionParam, locateField)) {
    const locateParam = actionParam[locateField];
    if (
      isPlainObject(locateParam) &&
      (locateParam.xpath ||
        locateParam.target ||
        locateParam.locatedPixelBbox) &&
      !locateParam.prompt
    ) {
      return {
        ...actionParam,
        [locateField]: { prompt: fallbackPrompt, ...locateParam },
      };
    }
    return actionParam;
  }

  const isLocatorShortcut = [
    'prompt',
    'xpath',
    'target',
    'locatedPixelBbox',
  ].some((field) => Object.prototype.hasOwnProperty.call(actionParam, field));
  if (!isLocatorShortcut) return actionParam;

  const locateParam: Record<string, unknown> = {};
  const actionParamWithoutLocate: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(actionParam)) {
    (locatorShortcutFields.has(key) ? locateParam : actionParamWithoutLocate)[
      key
    ] = value;
  }
  return {
    ...actionParamWithoutLocate,
    [locateField]: {
      ...(!locateParam.prompt ? { prompt: fallbackPrompt } : {}),
      ...locateParam,
    },
  };
}

function normalizeActionParamTargets(
  action: DeviceAction,
  actionParam: unknown,
): unknown {
  if (!action.paramSchema || !isPlainObject(actionParam)) return actionParam;
  let normalized: Record<string, unknown> | undefined;
  for (const field of findAllMidsceneLocatorField(action.paramSchema)) {
    const locator = actionParam[field];
    if (!isPlainObject(locator)) continue;
    if (locator.target !== undefined && locator.xpath !== undefined) {
      throw new Error(
        '`target` and `xpath` cannot be used in the same locator',
      );
    }
    if (typeof locator.xpath !== 'string') continue;
    const { xpath, ...withoutXpath } = locator;
    normalized ??= { ...actionParam };
    normalized[field] = {
      ...withoutXpath,
      target: { strategy: 'xpath', selector: xpath },
    };
  }
  return normalized ?? actionParam;
}

function validateActionParam(
  action: DeviceAction,
  actionParam: unknown,
  sourcePath: string,
  actionIndex: number,
): unknown {
  if (!action.paramSchema) {
    if (
      actionParam !== undefined &&
      (!isPlainObject(actionParam) || Object.keys(actionParam).length > 0)
    ) {
      throw new Error(
        `Invalid extra action file "${sourcePath}": "actions[${actionIndex}].action.param" must be omitted for parameterless action "${action.name}"`,
      );
    }
    return undefined;
  }

  const result = action.paramSchema.safeParse(actionParam);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${field}: ${issue.message}`;
    })
    .join('; ');
  throw new Error(
    `Invalid extra action file "${sourcePath}": "actions[${actionIndex}].action.param" does not match action "${action.name}": ${details}`,
  );
}

function createPlanningAction(alias: string, name: string): DeviceAction {
  return {
    name: alias,
    description: `High-priority exact UI action: ${JSON.stringify(name)}. Use this parameterless action when it matches the next requested operation.`,
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
  manifestInterface?: string,
): Promise<LoadedExtraAction[]> {
  if (paths.length === 0) return [];
  const loadedActions: LoadedExtraAction[] = [];
  const knownNames = new Set<string>();
  const reservedAliases = new Set(
    actionSpace.flatMap((action) =>
      [action.name, action.interfaceAlias]
        .filter((name): name is string => Boolean(name))
        .map((name) => name.toLowerCase()),
    ),
  );
  let nextAliasIndex = 1;

  const allocateAlias = (): string => {
    let alias = `MidsceneExtraAction_${nextAliasIndex}`;
    while (reservedAliases.has(alias.toLowerCase())) {
      nextAliasIndex += 1;
      alias = `MidsceneExtraAction_${nextAliasIndex}`;
    }
    nextAliasIndex += 1;
    reservedAliases.add(alias.toLowerCase());
    return alias;
  };

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
    const parsed = parseExtraActionFile(content, sourcePath);
    if (
      parsed.manifestInterface &&
      manifestInterface &&
      parsed.manifestInterface !== manifestInterface
    ) {
      throw new Error(
        `Invalid extra action file "${sourcePath}": interface "${parsed.manifestInterface}" does not match current interface "${manifestInterface}"`,
      );
    }

    for (const [definitionIndex, definition] of parsed.definitions.entries()) {
      if (knownNames.has(definition.name)) {
        throw new Error(
          `Invalid extra action file "${sourcePath}": action name "${definition.name}" conflicts with another action`,
        );
      }
      const referencedAction = findReferencedAction(
        definition.action.name,
        actionSpace,
        sourcePath,
      );
      knownNames.add(definition.name);

      // Native manifests use Action Space's param shape directly. Only legacy
      // one-action files get shortcut normalization; both formats accept
      // `xpath` as a read-only compatibility alias for `target`.
      const rawParamBeforeTargetNormalization = parsed.legacy
        ? normalizeLegacyActionParam(
            referencedAction,
            definition.action.param,
            definition.name,
          )
        : definition.action.param;
      const rawParam = normalizeActionParamTargets(
        referencedAction,
        rawParamBeforeTargetNormalization,
      );
      const plan: PlanningAction = {
        type: referencedAction.name,
        param: validateActionParam(
          referencedAction,
          rawParam,
          sourcePath,
          definitionIndex,
        ),
        thought: `Run extra action "${definition.name}"`,
      };

      loadedActions.push({
        alias: allocateAlias(),
        name: definition.name,
        sourcePath,
        plan,
        validWhenTargetExists: definition.validWhenTargetExists,
      });
    }
  }
  return loadedActions;
}

interface SnapshotAction {
  alias: string;
  loaded: LoadedExtraAction;
  planningAction: DeviceAction;
}

function createSnapshotActions(
  disclosed: LoadedExtraAction[],
): SnapshotAction[] {
  return disclosed.map((loaded) => {
    return {
      alias: loaded.alias,
      loaded,
      planningAction: Object.freeze(
        createPlanningAction(loaded.alias, loaded.name),
      ),
    };
  });
}

function expandSnapshotPlans(
  plans: PlanningAction[],
  snapshotActions: SnapshotAction[],
): PlanningAction[] {
  const byAlias = new Map(snapshotActions.map((entry) => [entry.alias, entry]));
  return plans.map((plan) => {
    const entry = byAlias.get(plan.type);
    if (!entry) return plan;
    const expanded = {
      ...entry.loaded.plan,
      param: structuredClone(entry.loaded.plan.param),
      thought: plan.thought || entry.loaded.plan.thought,
    };
    setExtraActionSource(expanded, {
      type: 'extra-action',
      name: entry.loaded.name,
      alias: entry.alias,
      sourcePath: entry.loaded.sourcePath,
    });
    return expanded;
  });
}

function targetKey(target: LocatorTarget): string {
  return JSON.stringify(target);
}

export async function createExtraActionSnapshot(
  extraActions: LoadedExtraAction[],
  interfaceInstance?: Pick<AbstractInterface, 'probeLocatorTargets'>,
  options: { signal?: AbortSignal } = {},
): Promise<ExtraActionSnapshot> {
  options.signal?.throwIfAborted();
  const conditionalTargets = extraActions.flatMap((action) =>
    action.validWhenTargetExists ? [action.validWhenTargetExists] : [],
  );
  const uniqueTargets = Array.from(
    new Map(
      conditionalTargets.map((target) => [targetKey(target), target]),
    ).values(),
  );
  if (uniqueTargets.length > 0 && !interfaceInstance?.probeLocatorTargets) {
    throw new Error(
      'Extra actions use validWhenTargetExists, but the current interface cannot probe locator targets',
    );
  }
  const existenceResult =
    uniqueTargets.length === 0
      ? []
      : await interfaceInstance!.probeLocatorTargets!(uniqueTargets, options);
  options.signal?.throwIfAborted();
  if (!Array.isArray(existenceResult)) {
    throw new Error('probeLocatorTargets must return a boolean array');
  }
  const existence = existenceResult as readonly unknown[];
  if (existence.length !== uniqueTargets.length) {
    throw new Error(
      `probeLocatorTargets returned ${existence.length} result(s) for ${uniqueTargets.length} target(s)`,
    );
  }
  if (existence.some((value) => typeof value !== 'boolean')) {
    throw new Error('probeLocatorTargets must return only boolean results');
  }
  const existenceByTarget = new Map(
    uniqueTargets.map((target, index) => [targetKey(target), existence[index]]),
  );
  const disclosed = extraActions.filter(
    (action) =>
      !action.validWhenTargetExists ||
      existenceByTarget.get(targetKey(action.validWhenTargetExists)) === true,
  );
  const snapshotActions = createSnapshotActions(disclosed);
  const aliases = new Set(snapshotActions.map((entry) => entry.alias));
  const fingerprintPayload = JSON.stringify({
    manifest: extraActions.map((action) => ({
      name: action.name,
      validWhenTargetExists: action.validWhenTargetExists,
      plan: action.plan,
    })),
    disclosed: snapshotActions.map((entry) => ({
      alias: entry.alias,
      name: entry.loaded.name,
    })),
  });
  const fingerprint = `extra-actions-snapshot:v1:${createHash('sha256')
    .update(fingerprintPayload)
    .digest('hex')}`;
  return {
    actionSpace: Object.freeze(
      snapshotActions.map((entry) => entry.planningAction),
    ),
    fingerprint,
    expandPlans: (plans) => ({
      plans: expandSnapshotPlans(plans, snapshotActions),
      expanded: plans.some((plan) => aliases.has(plan.type)),
    }),
  };
}

export function createExtraActionExecutionOptions(
  extraActions: LoadedExtraAction[],
  interfaceInstance?: Pick<AbstractInterface, 'probeLocatorTargets'>,
) {
  if (extraActions.length === 0) return undefined;
  return {
    createSnapshot: (options?: { signal?: AbortSignal }) =>
      createExtraActionSnapshot(extraActions, interfaceInstance, options),
  };
}
