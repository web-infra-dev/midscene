import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { collectDedupedExecutions } from './report';
import type { ExecutionTask } from './types';

export interface UIActionDefinition {
  name: string;
  actionName: string;
  actionParam: [unknown];
}

export interface AnalyzeReportActionsOptions {
  htmlPath: string;
  outputDir?: string;
  overwrite?: boolean;
}

export interface AnalyzeReportActionsResult {
  outputDir: string;
  actionFiles: string[];
  coordinateFallbackFiles: string[];
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

function firstXpath(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const xpaths = value.xpaths;
  if (!Array.isArray(xpaths)) return undefined;
  return firstNonEmptyString(...xpaths);
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
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
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
    rect: {
      left: number;
      top: number;
      width: number;
      height: number;
    };
  },
): { value: Record<string, unknown>; usedCoordinateFallback: boolean } {
  const sourceParam = isRecord(locateTask?.param) ? locateTask.param : {};
  const hitContext = isRecord(locateTask?.hitBy?.context)
    ? locateTask.hitBy.context
    : {};

  const prompt =
    sourceParam.prompt ??
    firstNonEmptyString(sourceParam.promptDisplay, locatedElement.description);
  const xpath = firstNonEmptyString(
    sourceParam.xpath,
    hitContext.xpath,
    firstXpath(hitContext.cacheToSave),
    firstXpath(hitContext.cacheEntry),
  );

  if (xpath) {
    return {
      value: {
        ...(prompt !== undefined ? { prompt } : {}),
        xpath,
      },
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
): { value: unknown; usedCoordinateFallback: boolean } {
  if (isLocatedElement(value)) {
    const result = locatorFromTask(locateTasks[locateIndex.value], value);
    locateIndex.value += 1;
    return result;
  }

  if (Array.isArray(value)) {
    let usedCoordinateFallback = false;
    const restored = value.map((item) => {
      const result = restoreStableLocators(item, locateTasks, locateIndex);
      usedCoordinateFallback ||= result.usedCoordinateFallback;
      return result.value;
    });
    return { value: restored, usedCoordinateFallback };
  }

  if (isRecord(value)) {
    let usedCoordinateFallback = false;
    const restored = Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const result = restoreStableLocators(item, locateTasks, locateIndex);
        usedCoordinateFallback ||= result.usedCoordinateFallback;
        return [key, result.value];
      }),
    );
    return { value: restored, usedCoordinateFallback };
  }

  return { value, usedCoordinateFallback: false };
}

function flattenSingleLocatorShortcut(
  originalParam: unknown,
  restoredParam: unknown,
): unknown {
  if (!isRecord(originalParam) || !isRecord(restoredParam)) {
    return restoredParam;
  }

  const locatorFields = Object.entries(originalParam).filter(([, value]) =>
    isLocatedElement(value),
  );
  if (locatorFields.length !== 1) return restoredParam;

  const [locatorField] = locatorFields[0];
  const restoredLocator = restoredParam[locatorField];
  if (!isRecord(restoredLocator)) return restoredParam;

  return {
    ...Object.fromEntries(
      Object.entries(restoredParam).filter(([key]) => key !== locatorField),
    ),
    ...restoredLocator,
  };
}

function actionNameFromTask(
  task: ExecutionTask,
  planLog: string | undefined,
): string {
  const actionName = task.subType || 'Action';
  if (planLog) {
    const sanitizedPlanLog = Array.from(planLog)
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
      sanitizedPlanLog &&
      sanitizedPlanLog.toLowerCase() !== actionName.toLowerCase()
    ) {
      return sanitizedPlanLog;
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
    let pendingLocateTasks: ExecutionTask[] = [];

    for (const task of execution.tasks) {
      if (task.type === 'Planning' && task.subType === 'Plan') {
        planLog = isRecord(task.output)
          ? firstNonEmptyString(task.output.log)
          : undefined;
        continue;
      }

      if (task.type === 'Planning' && task.subType === 'Locate') {
        pendingLocateTasks.push(task);
        continue;
      }

      if (task.type !== 'Action Space') continue;

      const locateTasks = pendingLocateTasks;
      pendingLocateTasks = [];
      const currentPlanLog = planLog;
      planLog = undefined;

      if (task.status !== 'finished' || task.subType === 'Finished') {
        continue;
      }

      const restored = restoreStableLocators(task.param, locateTasks, {
        value: 0,
      });
      const baseName = actionNameFromTask(task, currentPlanLog);
      const nameCount = (nameCounts.get(baseName) ?? 0) + 1;
      nameCounts.set(baseName, nameCount);
      actions.push({
        definition: {
          name: nameCount === 1 ? baseName : `${baseName} (${nameCount})`,
          actionName: task.subType || 'Action',
          actionParam: [
            flattenSingleLocatorShortcut(task.param, restored.value),
          ],
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

function defaultAnalyzeOutputDir(resolvedHtmlPath: string): string {
  const reportDir = path.dirname(resolvedHtmlPath);
  const reportBaseName = path.basename(
    resolvedHtmlPath,
    path.extname(resolvedHtmlPath),
  );

  if (reportBaseName === 'index') {
    return path.join(
      path.dirname(reportDir),
      `${path.basename(reportDir)}-ui-actions`,
    );
  }

  return path.join(reportDir, `${reportBaseName}-ui-actions`);
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
  const { executions } = collectDedupedExecutions(resolvedHtmlPath);
  const actions = extractUIActions(executions);

  if (actions.length === 0) {
    throw new Error(
      `analyzeReportActions: no successful UI actions found in ${options.htmlPath}`,
    );
  }

  const actionFiles = actions.map((action, index) =>
    path.join(
      outputDir,
      `${String(index + 1).padStart(3, '0')}-${action.definition.actionName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'action'}.yaml`,
    ),
  );
  const existingFiles = actionFiles.filter((file) => existsSync(file));
  if (existingFiles.length > 0 && !options.overwrite) {
    throw new Error(
      `analyzeReportActions: output file already exists: ${existingFiles[0]}. Pass overwrite: true or --overwrite to replace generated UI Actions.`,
    );
  }

  mkdirSync(outputDir, { recursive: true });
  actions.forEach((action, index) => {
    writeFileSync(
      actionFiles[index],
      yaml.dump(action.definition, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
      }),
      'utf-8',
    );
  });

  return {
    outputDir,
    actionFiles,
    coordinateFallbackFiles: actionFiles.filter(
      (_file, index) => actions[index].usedCoordinateFallback,
    ),
  };
}
