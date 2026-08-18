import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import {
  type ExtraActionDefinition,
  type ExtraActionManifest,
  parseExtraActionManifest,
} from './agent/extra-action-manifest';
import {
  type LocatorTarget,
  LocatorTargetSchema,
  xpathLocatorTarget,
} from './locator';
import { collectDedupedExecutions } from './report';
import type { ExecutionTask } from './types';

export type UIActionDefinition = ExtraActionDefinition;
export type UIActionManifest = ExtraActionManifest;

export interface AnalyzeReportActionsOptions {
  htmlPath: string;
  outputDir?: string;
  overwrite?: boolean;
}

export interface AnalyzeReportActionsResult {
  outputDir: string;
  actionFiles: string[];
  actionCount: number;
  coordinateFallbackFiles: string[];
  coordinateFallbackActionCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0,
  );
}

function firstTarget(value: unknown): LocatorTarget | undefined {
  if (!isRecord(value) || !Array.isArray(value.targets)) return undefined;
  for (const target of value.targets) {
    const parsed = LocatorTargetSchema.safeParse(target);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

function firstLegacyXpath(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.xpaths)) return undefined;
  return firstNonEmptyString(...value.xpaths);
}

function targetFromValue(value: unknown): LocatorTarget | undefined {
  const parsed = LocatorTargetSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function validLocatedPixelBbox(
  value: unknown,
): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

function isLocatedElement(value: unknown): value is Record<string, unknown> & {
  description?: string;
  rect: { left: number; top: number; width: number; height: number };
} {
  if (!isRecord(value) || !isRecord(value.rect)) return false;
  const { left, top, width, height } = value.rect;
  return [left, top, width, height].every(
    (item) => typeof item === 'number' && Number.isFinite(item),
  );
}

function locatorFromTask(
  locateTask: ExecutionTask | undefined,
  locatedElement: Record<string, unknown> & {
    description?: string;
    rect: { left: number; top: number; width: number; height: number };
  },
): {
  value: Record<string, unknown>;
  target?: LocatorTarget;
  usedCoordinateFallback: boolean;
} {
  const sourceParam = isRecord(locateTask?.param) ? locateTask.param : {};
  const hitContext = isRecord(locateTask?.hitBy?.context)
    ? locateTask.hitBy.context
    : {};
  const prompt =
    sourceParam.prompt ??
    firstNonEmptyString(sourceParam.promptDisplay, locatedElement.description);
  const attemptedTargetFailed =
    typeof hitContext.targetResolutionError === 'string' &&
    hitContext.targetResolutionError.trim().length > 0;
  const target =
    (!attemptedTargetFailed
      ? (targetFromValue(sourceParam.target) ??
        targetFromValue(hitContext.target))
      : undefined) ??
    firstTarget(hitContext.cacheToSave) ??
    firstTarget(hitContext.cacheEntry);
  const legacyXpath = firstNonEmptyString(
    sourceParam.xpath,
    hitContext.xpath,
    firstLegacyXpath(hitContext.cacheToSave),
    firstLegacyXpath(hitContext.cacheEntry),
  );
  const normalizedTarget =
    target ?? (legacyXpath ? xpathLocatorTarget(legacyXpath) : undefined);

  if (normalizedTarget) {
    return {
      value: {
        ...(prompt !== undefined ? { prompt } : {}),
        target: normalizedTarget,
      },
      target: normalizedTarget,
      usedCoordinateFallback: false,
    };
  }

  const sourceBbox = validLocatedPixelBbox(sourceParam.locatedPixelBbox)
    ? sourceParam.locatedPixelBbox
    : undefined;
  const rectBbox: [number, number, number, number] = [
    locatedElement.rect.left,
    locatedElement.rect.top,
    locatedElement.rect.left + locatedElement.rect.width,
    locatedElement.rect.top + locatedElement.rect.height,
  ];
  return {
    value: {
      ...(prompt !== undefined ? { prompt } : {}),
      locatedPixelBbox: sourceBbox ?? rectBbox,
    },
    usedCoordinateFallback: true,
  };
}

function restoreStableLocators(
  value: unknown,
  locateTasks: ExecutionTask[],
  locateIndex: { value: number },
): {
  value: unknown;
  targets: LocatorTarget[];
  usedCoordinateFallback: boolean;
} {
  if (isLocatedElement(value)) {
    const result = locatorFromTask(locateTasks[locateIndex.value], value);
    locateIndex.value += 1;
    return {
      value: result.value,
      targets: result.target ? [result.target] : [],
      usedCoordinateFallback: result.usedCoordinateFallback,
    };
  }
  if (Array.isArray(value)) {
    const restored = value.map((item) =>
      restoreStableLocators(item, locateTasks, locateIndex),
    );
    return {
      value: restored.map((item) => item.value),
      targets: restored.flatMap((item) => item.targets),
      usedCoordinateFallback: restored.some(
        (item) => item.usedCoordinateFallback,
      ),
    };
  }
  if (isRecord(value)) {
    const restored = Object.entries(value).map(
      ([key, item]) =>
        [key, restoreStableLocators(item, locateTasks, locateIndex)] as const,
    );
    return {
      value: Object.fromEntries(
        restored.map(([key, item]) => [key, item.value]),
      ),
      targets: restored.flatMap(([, item]) => item.targets),
      usedCoordinateFallback: restored.some(
        ([, item]) => item.usedCoordinateFallback,
      ),
    };
  }
  return { value, targets: [], usedCoordinateFallback: false };
}

function actionNameFromTask(
  task: ExecutionTask,
  plannedAction: Record<string, unknown> | undefined,
  planLog: string | undefined,
): string {
  const actionName = task.subType || 'Action';
  const extraActionName = isRecord(task.hitBy?.context)
    ? firstNonEmptyString(task.hitBy.context.extraActionName)
    : undefined;
  if (task.hitBy?.from === 'Extra Action' && extraActionName) {
    return extraActionName;
  }
  const planningDescription = firstNonEmptyString(
    plannedAction?.thought,
    planLog,
  );
  if (planningDescription) {
    const sanitizedPlanningDescription = Array.from(planningDescription)
      .map((character) => {
        const codePoint = character.codePointAt(0);
        const invalid =
          character === '<' ||
          character === '>' ||
          codePoint === undefined ||
          codePoint < 0x20 ||
          (codePoint >= 0x7f && codePoint <= 0x9f) ||
          codePoint === 0x2028 ||
          codePoint === 0x2029;
        return invalid ? ' ' : character;
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (
      sanitizedPlanningDescription &&
      sanitizedPlanningDescription.toLowerCase() !== actionName.toLowerCase()
    ) {
      return sanitizedPlanningDescription;
    }
  }
  if (isRecord(task.param)) {
    for (const value of Object.values(task.param)) {
      if (isLocatedElement(value) && value.description) {
        return `${actionName}: ${value.description}`;
      }
    }
    const value = firstNonEmptyString(task.param.value);
    if (value) return `${actionName}: ${value}`;
  }
  return `Replay ${actionName}`;
}

function extractUIActions(
  executions: ReturnType<typeof collectDedupedExecutions>['executions'],
): Array<{
  definition: UIActionDefinition;
  usedCoordinateFallback: boolean;
}> {
  const actions: Array<{
    definition: UIActionDefinition;
    usedCoordinateFallback: boolean;
  }> = [];
  const nameCounts = new Map<string, number>();

  for (const execution of executions) {
    let planLog: string | undefined;
    let plannedActions: Record<string, unknown>[] = [];
    let planActionCount = 0;
    let pendingLocateTasks: ExecutionTask[] = [];
    for (const task of execution.tasks) {
      if (task.type === 'Planning' && task.subType === 'Plan') {
        const planOutput = isRecord(task.output) ? task.output : {};
        planLog = firstNonEmptyString(planOutput.log);
        plannedActions = Array.isArray(planOutput.actions)
          ? planOutput.actions.filter(isRecord)
          : [];
        planActionCount = plannedActions.length;
        pendingLocateTasks = [];
        continue;
      }
      if (task.type === 'Planning' && task.subType === 'Locate') {
        if (task.status === 'finished') {
          pendingLocateTasks.push(task);
        }
        continue;
      }
      if (task.type !== 'Action Space') continue;

      if (task.subType === 'Finished') {
        pendingLocateTasks = [];
        continue;
      }

      const locateTasks = pendingLocateTasks;
      pendingLocateTasks = [];
      const plannedAction = plannedActions.shift();
      const currentPlanLog = planActionCount <= 1 ? planLog : undefined;
      if (task.status !== 'finished') continue;

      const restored = restoreStableLocators(task.param, locateTasks, {
        value: 0,
      });
      const baseName = actionNameFromTask(task, plannedAction, currentPlanLog);
      const nameCount = (nameCounts.get(baseName) ?? 0) + 1;
      nameCounts.set(baseName, nameCount);
      actions.push({
        definition: {
          name: nameCount === 1 ? baseName : `${baseName} (${nameCount})`,
          ...(restored.targets.length > 0
            ? { validWhenTargetExists: restored.targets[0] }
            : {}),
          action: {
            name: task.subType || 'Action',
            ...(restored.value !== undefined && restored.value !== null
              ? { param: restored.value }
              : {}),
          },
        },
        usedCoordinateFallback: restored.usedCoordinateFallback,
      });
    }
  }
  return actions;
}

function resolveReportHtmlPath(htmlPath: string): string {
  const normalizedPath = path.resolve(htmlPath);
  if (!existsSync(normalizedPath)) {
    throw new Error(`analyzeReportActions: report does not exist: ${htmlPath}`);
  }
  const stats = statSync(normalizedPath);
  if (!stats.isDirectory()) return normalizedPath;
  const indexHtmlPath = path.join(normalizedPath, 'index.html');
  if (!existsSync(indexHtmlPath)) {
    throw new Error(
      `analyzeReportActions: "${htmlPath}" is not an HTML report file, and no index.html was found under this directory.`,
    );
  }
  return indexHtmlPath;
}

function reportBaseName(resolvedHtmlPath: string): string {
  const baseName = path.basename(
    resolvedHtmlPath,
    path.extname(resolvedHtmlPath),
  );
  return baseName === 'index'
    ? path.basename(path.dirname(resolvedHtmlPath))
    : baseName;
}

function defaultAnalyzeOutputDir(resolvedHtmlPath: string): string {
  const reportDir = path.dirname(resolvedHtmlPath);
  const baseName = reportBaseName(resolvedHtmlPath);
  return path.basename(resolvedHtmlPath, path.extname(resolvedHtmlPath)) ===
    'index'
    ? path.join(path.dirname(reportDir), `${baseName}-ui-actions`)
    : path.join(reportDir, `${baseName}-ui-actions`);
}

export function analyzeReportActions(
  options: AnalyzeReportActionsOptions,
): AnalyzeReportActionsResult {
  if (!options.htmlPath) {
    throw new Error('analyzeReportActions: htmlPath is required');
  }
  const resolvedHtmlPath = resolveReportHtmlPath(options.htmlPath);
  const outputDir = path.resolve(
    options.outputDir ?? defaultAnalyzeOutputDir(resolvedHtmlPath),
  );
  const { executions, manifestInterfaces } =
    collectDedupedExecutions(resolvedHtmlPath);
  const normalizedManifestInterfaces = manifestInterfaces.map((value) =>
    value.trim(),
  );
  const uniqueManifestInterfaces = new Set(normalizedManifestInterfaces);
  const manifestInterface = Array.from(uniqueManifestInterfaces)[0];
  if (
    !manifestInterface ||
    uniqueManifestInterfaces.size !== 1 ||
    manifestInterface === 'mixed' ||
    manifestInterface === 'unknown'
  ) {
    throw new Error(
      `analyzeReportActions: every report dump with executions must declare the same canonical manifestInterface; received ${JSON.stringify(normalizedManifestInterfaces)}`,
    );
  }
  const actions = extractUIActions(executions);
  if (actions.length === 0) {
    throw new Error(
      `analyzeReportActions: no successful UI actions found in ${options.htmlPath}`,
    );
  }

  const actionFile = path.join(
    outputDir,
    `${reportBaseName(resolvedHtmlPath)}.actions.yaml`,
  );
  if (existsSync(actionFile) && !options.overwrite) {
    throw new Error(
      `analyzeReportActions: output file already exists: ${actionFile}. Pass overwrite: true or --overwrite to replace the generated Action Manifest.`,
    );
  }
  const manifest: UIActionManifest = {
    version: 1,
    interface: manifestInterface,
    actions: actions.map((action) => action.definition),
  };
  const manifestYaml = yaml.dump(manifest, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
  parseExtraActionManifest(manifestYaml, actionFile);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(actionFile, manifestYaml, 'utf-8');

  const coordinateFallbackActionCount = actions.filter(
    (action) => action.usedCoordinateFallback,
  ).length;
  return {
    outputDir,
    actionFiles: [actionFile],
    actionCount: actions.length,
    coordinateFallbackFiles:
      coordinateFallbackActionCount > 0 ? [actionFile] : [],
    coordinateFallbackActionCount,
  };
}
