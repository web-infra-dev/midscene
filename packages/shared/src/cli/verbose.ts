import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { writeCliScreenshotFile } from './screenshot-file';

export const cliVerboseFlag = 'verbose';

const progressEventName = 'midscene_progress';
const cliVerboseContextKey = '__midscene_cli_verbose_context__';

export type CliVerboseFormat = 'text' | 'jsonl';

export interface CliVerboseContext {
  enabled: boolean;
  format?: CliVerboseFormat;
  scriptName?: string;
  commandName?: string;
  startedAt?: number;
  renderedLineKeys?: Set<string>;
}

export interface CliVerboseEvent {
  event: string;
  scriptName?: string;
  command?: string;
  status?: 'ok' | 'error';
  durationMs?: number;
  error?: string;
  [key: string]: unknown;
}

type DumpUpdateAgent = {
  addDumpUpdateListener?: (
    listener: (dump: string, executionDump?: unknown) => void,
  ) => () => void;
  reportFile?: string | null;
};

interface CliVerboseScreenshotRefLike {
  type: 'midscene_screenshot_ref';
  id?: unknown;
  mimeType?: unknown;
  storage?: unknown;
  path?: string;
}

interface CliVerboseExecutionTaskLike {
  taskId?: unknown;
  type?: unknown;
  subType?: unknown;
  status?: unknown;
  param?: unknown;
  thought?: unknown;
  output?: unknown;
  log?: unknown;
  errorMessage?: unknown;
  timing?: {
    cost?: unknown;
  };
  recorder?: unknown;
  uiContext?: {
    screenshot?: unknown;
  };
}

interface CliVerboseStepSummary {
  id?: unknown;
  index: number;
  total: number;
  type?: unknown;
  subType?: unknown;
  status?: unknown;
  param?: unknown;
  message: string;
  error?: unknown;
  durationMs?: unknown;
  screenshots?: Array<Record<string, unknown>>;
}

interface CliVerboseExecutionDumpLike {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  tasks: CliVerboseExecutionTaskLike[];
}

interface CliVerboseLine {
  key: string;
  text: string;
}

const getGlobalContext = (): { current: CliVerboseContext } => {
  const globalWithContext = globalThis as unknown as Record<
    string,
    { current: CliVerboseContext } | undefined
  >;
  if (!globalWithContext[cliVerboseContextKey]) {
    globalWithContext[cliVerboseContextKey] = { current: { enabled: false } };
  }
  return globalWithContext[cliVerboseContextKey]!;
};

function parseVerboseFormat(rawFormat: string): CliVerboseFormat {
  if (rawFormat === 'text' || rawFormat === 'jsonl') {
    return rawFormat;
  }

  throw new Error(
    `Unsupported --${cliVerboseFlag} format "${rawFormat}". Use "--${cliVerboseFlag}" or "--${cliVerboseFlag}=jsonl".`,
  );
}

export function stripVerboseFlag(argv: readonly string[]): {
  rawArgs: string[];
  verbose: boolean;
  format: CliVerboseFormat;
} {
  const rawArgs: string[] = [];
  let verbose = false;
  let format: CliVerboseFormat = 'text';

  for (const arg of argv) {
    if (arg === `--${cliVerboseFlag}`) {
      verbose = true;
      continue;
    }
    if (arg.startsWith(`--${cliVerboseFlag}=`)) {
      verbose = true;
      format = parseVerboseFormat(arg.slice(`--${cliVerboseFlag}=`.length));
      continue;
    }
    rawArgs.push(arg);
  }

  return { rawArgs, verbose, format };
}

export async function withCliVerboseContext<T>(
  context: CliVerboseContext,
  fn: () => Promise<T>,
): Promise<T> {
  const globalContext = getGlobalContext();
  const previous = globalContext.current;
  globalContext.current = {
    ...context,
    renderedLineKeys: context.renderedLineKeys ?? new Set(),
  };
  try {
    return await fn();
  } finally {
    globalContext.current = previous;
  }
}

export function getCliVerboseContext(): CliVerboseContext {
  return getGlobalContext().current;
}

export function isCliVerboseEnabled(): boolean {
  return getCliVerboseContext().enabled;
}

export function emitCliVerboseEvent(event: CliVerboseEvent): void {
  const context = getCliVerboseContext();
  if (!context.enabled) {
    return;
  }

  const payload = {
    type: progressEventName,
    timestamp: new Date().toISOString(),
    scriptName: context.scriptName,
    command: context.commandName,
    ...event,
  };

  if (context.format === 'jsonl') {
    console.log(JSON.stringify(payload));
    return;
  }

  const text = renderCliVerboseEventText(payload, context);
  if (text) {
    console.log(text);
  }
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compactText(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    return value.length > 180 ? `${value.slice(0, 177)}...` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    const json = JSON.stringify(value);
    return json.length > 180 ? `${json.slice(0, 177)}...` : json;
  } catch {
    return String(value);
  }
}

function compactPrimitiveCliVerboseValue(
  value: unknown,
): { handled: true; value: unknown } | { handled: false } {
  if (value === undefined || value === null) {
    return { handled: true, value };
  }

  if (typeof value === 'string') {
    return {
      handled: true,
      value: value.length > 180 ? `${value.slice(0, 177)}...` : value,
    };
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return { handled: true, value };
  }

  if (typeof value !== 'object') {
    return { handled: true, value: String(value) };
  }

  return { handled: false };
}

function compactStructuredCliVerboseValue(value: unknown): unknown {
  const primitive = compactPrimitiveCliVerboseValue(value);
  if (primitive.handled) {
    return primitive.value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 5).map(compactStructuredCliVerboseValue);
  }

  if (!isRecord(value)) {
    return String(value);
  }

  const entries = Object.entries(value).slice(0, 6);
  return Object.fromEntries(
    entries.map(([key, entryValue]) => [
      key,
      compactStructuredCliVerboseValue(entryValue),
    ]),
  );
}

export function compactCliVerboseValue(value: unknown): unknown {
  const primitive = compactPrimitiveCliVerboseValue(value);
  if (primitive.handled) {
    return primitive.value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 5).map(compactCliVerboseValue);
  }

  if (isRecord(value) && typeof value.prompt === 'string') {
    return compactCliVerboseValue(value.prompt);
  }

  if (!isRecord(value)) {
    return String(value);
  }

  const entries = Object.entries(value).slice(0, 6);
  return Object.fromEntries(
    entries.map(([key, entryValue]) => [
      key,
      compactCliVerboseValue(entryValue),
    ]),
  );
}

export function compactCliVerboseArgs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args)
      .slice(0, 8)
      .map(([key, value]) => [key, compactStructuredCliVerboseValue(value)]),
  );
}

function summarizeParam(param: unknown): unknown {
  if (!param || typeof param !== 'object') {
    return compactCliVerboseValue(param);
  }

  const record = param as Record<string, unknown>;
  if (typeof record.prompt === 'string') {
    return compactCliVerboseValue(record.prompt);
  }
  if (
    record.locate &&
    typeof record.locate === 'object' &&
    record.locate !== null
  ) {
    const locate = record.locate as Record<string, unknown>;
    return {
      locate: compactCliVerboseValue(locate.prompt),
      ...Object.fromEntries(
        Object.entries(record)
          .filter(([key]) => key !== 'locate')
          .slice(0, 4)
          .map(([key, value]) => [key, compactCliVerboseValue(value)]),
      ),
    };
  }

  return compactCliVerboseValue(record);
}

function summarizeUserInstruction(value: unknown): string {
  if (typeof value === 'string') {
    return compactText(value);
  }

  if (isRecord(value) && typeof value.prompt === 'string') {
    return compactText(value.prompt);
  }

  return compactText(value);
}

function summarizeTaskParamText(task: CliVerboseExecutionTaskLike): string {
  if (!isRecord(task.param)) {
    return compactText(summarizeParam(task.param));
  }

  if (task.type === 'Planning' && task.subType !== 'Locate') {
    if (task.param.userInstructionDisplay) {
      return summarizeUserInstruction(task.param.userInstructionDisplay);
    }
    if (task.param.userInstruction) {
      return summarizeUserInstruction(task.param.userInstruction);
    }
  }

  if (task.param.dataDemand) {
    return compactText(summarizeParam(task.param.dataDemand));
  }

  if (task.param.assertion) {
    return compactText(summarizeParam(task.param.assertion));
  }

  return compactText(summarizeParam(task.param));
}

function summarizeSubGoals(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    return '';
  }

  const goals = value
    .slice(0, 6)
    .map((goal) => {
      if (!isRecord(goal)) {
        return '';
      }
      const index = typeof goal.index === 'number' ? `${goal.index}. ` : '';
      const status = typeof goal.status === 'string' ? `[${goal.status}] ` : '';
      const description =
        typeof goal.description === 'string' ? goal.description : '';
      return `${index}${status}${description}`.trim();
    })
    .filter(Boolean);

  return goals.length > 0 ? `sub-goals: ${goals.join('; ')}` : '';
}

function summarizeActions(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    return '';
  }

  const actions = value
    .slice(0, 5)
    .map((action) => {
      if (!isRecord(action)) {
        return '';
      }
      const type = typeof action.type === 'string' ? action.type : 'Action';
      const param = compactText(summarizeParam(action.param));
      return param ? `${type}: ${param}` : type;
    })
    .filter(Boolean);

  return actions.length > 0 ? `actions: ${actions.join('; ')}` : '';
}

function summarizeTaskOutputText(task: CliVerboseExecutionTaskLike): string {
  if (!isRecord(task.output)) {
    return compactText(task.output);
  }

  return (
    summarizeSubGoals(task.output.updateSubGoals) ||
    compactText(task.output.log) ||
    compactText(task.output.output) ||
    summarizeActions(task.output.actions)
  );
}

function summarizeTaskText(task: CliVerboseExecutionTaskLike): string {
  const parts = [task.type, task.subType].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  const label = parts.length > 0 ? parts.join('/') : 'Task';
  const status =
    typeof task.status === 'string' && task.status.length > 0
      ? task.status
      : 'unknown';
  const param = summarizeTaskParamText(task);
  const output = summarizeTaskOutputText(task);
  const thought = compactText(task.thought);
  const detail = output || thought || param;
  return detail ? `${label} ${status}: ${detail}` : `${label} ${status}`;
}

function isCliVerboseScreenshotRefLike(
  value: unknown,
): value is CliVerboseScreenshotRefLike {
  return isRecord(value) && value.type === 'midscene_screenshot_ref';
}

function toSerializableScreenshot(
  value: unknown,
): CliVerboseScreenshotRefLike | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const maybeSerializable = value as {
    toSerializable?: () => unknown;
  };
  if (typeof maybeSerializable.toSerializable === 'function') {
    try {
      const serialized = maybeSerializable.toSerializable();
      return isCliVerboseScreenshotRefLike(serialized) ? serialized : null;
    } catch {
      return null;
    }
  }

  return isCliVerboseScreenshotRefLike(value) ? value : null;
}

function getStringProperty(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  try {
    const property = value[key];
    return typeof property === 'string' && property.length > 0
      ? property
      : undefined;
  } catch {
    return undefined;
  }
}

function screenshotRawBase64(value: unknown): string | undefined {
  const rawBase64 = getStringProperty(value, 'rawBase64');
  if (rawBase64) {
    return rawBase64;
  }

  const base64 = getStringProperty(value, 'base64');
  const match = base64?.match(/^data:image\/(?:png|jpeg|jpg);base64,(.+)$/);
  return match?.[1];
}

function exportInlineScreenshotForVerbose(
  value: unknown,
  serialized: CliVerboseScreenshotRefLike,
  reportFile?: unknown,
): string | undefined {
  if (typeof serialized.path === 'string') {
    return serialized.path;
  }

  const rawBase64 = screenshotRawBase64(value);
  if (!rawBase64) {
    return undefined;
  }

  try {
    const directoryPath =
      typeof reportFile === 'string' && reportFile.length > 0
        ? join(dirname(reportFile), 'screenshots')
        : undefined;
    return writeCliScreenshotFile(rawBase64, {
      id: serialized.id,
      mimeType: serialized.mimeType,
      extension: getStringProperty(value, 'extension'),
      ...(directoryPath
        ? { directoryPath }
        : { directoryName: 'midscene-cli-screenshots' }),
      overwrite: false,
    });
  } catch {
    return undefined;
  }
}

function collectScreenshotRefs(
  value: unknown,
  reportFile?: unknown,
): Array<Record<string, unknown>> {
  const screenshots: Array<Record<string, unknown>> = [];
  const visit = (candidate: unknown, timing?: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item, timing);
      }
      return;
    }

    const serialized = toSerializableScreenshot(candidate);
    if (serialized?.type === 'midscene_screenshot_ref') {
      const screenshot: Record<string, unknown> = {
        id: serialized.id,
        storage: serialized.storage,
      };
      const exportedPath = exportInlineScreenshotForVerbose(
        candidate,
        serialized,
        reportFile,
      );
      if (exportedPath) {
        screenshot.path = exportedPath;
        screenshot.file = basename(exportedPath);
      }
      if (typeof timing === 'string') {
        screenshot.timing = timing;
      }
      screenshots.push(screenshot);
      return;
    }

    if (!isRecord(candidate)) {
      return;
    }

    const screenshotRecord = candidate.screenshot;
    if (screenshotRecord) {
      visit(screenshotRecord, candidate.timing);
    }
    if (candidate.recorder) {
      visit(candidate.recorder);
    }
    if (isRecord(candidate.uiContext)) {
      visit(candidate.uiContext.screenshot);
    }
  };

  visit(value);
  return screenshots;
}

function isCliVerboseExecutionDumpLike(
  value: unknown,
): value is CliVerboseExecutionDumpLike {
  return isRecord(value) && Array.isArray(value.tasks);
}

function summarizeDumpUpdate(
  executionDump: unknown,
): Record<string, unknown> | undefined {
  if (!isCliVerboseExecutionDumpLike(executionDump)) {
    return undefined;
  }

  const tasks = executionDump.tasks;
  const latestTask = tasks[tasks.length - 1];
  const steps = tasks.map(
    (task, index): CliVerboseStepSummary => ({
      id: task.taskId,
      index: index + 1,
      total: tasks.length,
      type: task.type,
      subType: task.subType,
      status: task.status,
      param: summarizeParam(task.param),
      message: summarizeTaskText(task),
      error: task.errorMessage,
      durationMs: task.timing?.cost,
      screenshots: collectScreenshotRefs(task).slice(-3),
    }),
  );

  return {
    execution: {
      id: executionDump.id,
      name: executionDump.name,
      description: compactCliVerboseValue(executionDump.description),
      taskCount: tasks.length,
    },
    steps,
    task: latestTask
      ? {
          id: latestTask.taskId,
          index: tasks.length,
          total: tasks.length,
          type: latestTask.type,
          subType: latestTask.subType,
          status: latestTask.status,
          param: summarizeParam(latestTask.param),
          message: summarizeTaskText(latestTask),
          error: latestTask.errorMessage,
          durationMs: latestTask.timing?.cost,
        }
      : undefined,
    screenshots: collectScreenshotRefs(tasks).slice(-5),
  };
}

function stringifyArgs(args: unknown): string {
  if (!isRecord(args) || Object.keys(args).length === 0) {
    return '';
  }

  return Object.entries(args)
    .map(([key, value]) => `${key}=${compactText(value)}`)
    .join(', ');
}

function renderScreenshotList(screenshots: unknown): string {
  if (!Array.isArray(screenshots) || screenshots.length === 0) {
    return '';
  }

  return screenshots
    .map((item) => {
      if (!isRecord(item)) {
        return '';
      }
      const path =
        typeof item.path === 'string'
          ? item.path
          : typeof item.file === 'string'
            ? item.file
            : typeof item.id === 'string'
              ? item.id
              : '';
      const timing = typeof item.timing === 'string' ? item.timing : '';
      return [timing, path].filter(Boolean).join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

function isActVerboseEvent(command?: string, tool?: string): boolean {
  return command === 'act' || tool === 'act';
}

function renderLinesOnce(
  context: CliVerboseContext,
  lines: CliVerboseLine[],
): string | undefined {
  if (lines.length === 0) {
    return undefined;
  }

  if (!context.renderedLineKeys) {
    context.renderedLineKeys = new Set();
  }
  const renderedLineKeys = context.renderedLineKeys;
  const pendingLines = lines.filter((line) => {
    if (renderedLineKeys.has(line.key)) {
      return false;
    }
    renderedLineKeys.add(line.key);
    return true;
  });

  return pendingLines.length > 0
    ? pendingLines.map((line) => line.text).join('\n')
    : undefined;
}

function taskKey(task: CliVerboseExecutionTaskLike, fallback: string): string {
  return typeof task.taskId === 'string' && task.taskId.length > 0
    ? task.taskId
    : fallback;
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function integerText(value: number): string {
  return String(Math.round(value));
}

function formatPoint(point: readonly [number, number]): string {
  return `(${integerText(point[0])}, ${integerText(point[1])})`;
}

function formatBbox(bbox: readonly [number, number, number, number]): string {
  return `(${bbox.map(integerText).join(',')})`;
}

function bboxArrayFromProperty(
  value: Record<string, unknown>,
  key: string,
): [number, number, number, number] | undefined {
  const bbox = value[key];
  if (!Array.isArray(bbox) || bbox.length < 4) {
    return undefined;
  }

  const left = numberFromUnknown(bbox[0]);
  const top = numberFromUnknown(bbox[1]);
  const right = numberFromUnknown(bbox[2]);
  const bottom = numberFromUnknown(bbox[3]);
  if (
    left === undefined ||
    top === undefined ||
    right === undefined ||
    bottom === undefined
  ) {
    return undefined;
  }

  return [left, top, right, bottom];
}

function centerPointFromBbox(
  bbox: readonly [number, number, number, number],
): [number, number] {
  return [
    Math.floor((bbox[0] + bbox[2]) / 2),
    Math.floor((bbox[1] + bbox[3]) / 2),
  ];
}

function pathForReportScreenshot(path: string, reportFile?: unknown): string {
  const resolvedPath =
    typeof reportFile === 'string' &&
    reportFile.length > 0 &&
    (path.startsWith('./') || path.startsWith('../'))
      ? join(dirname(reportFile), path)
      : path;

  if (!isAbsolute(resolvedPath)) {
    return resolvedPath;
  }

  const relativePath = relative(process.cwd(), resolvedPath);
  if (
    relativePath &&
    !relativePath.startsWith('..') &&
    !isAbsolute(relativePath)
  ) {
    return relativePath;
  }

  return resolvedPath;
}

function latestScreenshotPathForAiAct(
  value: unknown,
  reportFile?: unknown,
): string {
  const screenshot = collectScreenshotRefs(value, reportFile)
    .slice()
    .reverse()
    .find((item) => typeof item.path === 'string' && item.path.length > 0);
  const path = typeof screenshot?.path === 'string' ? screenshot.path : '';
  return path ? pathForReportScreenshot(path, reportFile) : '';
}

function planLimitText(task: CliVerboseExecutionTaskLike): string {
  if (!isRecord(task.param)) {
    return '';
  }
  const limit = numberFromUnknown(task.param.replanningCycleLimit);
  return limit && limit > 0 ? `/${integerText(limit)}` : '';
}

function planPrefix(
  task: CliVerboseExecutionTaskLike,
  planIndex: number,
): string {
  return `[Midscene][aiAct][Plan ${planIndex}${planLimitText(task)}]`;
}

function actionOutputText(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    return '';
  }

  const action = value.find(isRecord);
  if (!action) {
    return '';
  }

  return (
    compactText(action.log) ||
    compactText(action.thought) ||
    compactText(summarizeParam(action.param))
  );
}

function plannedTextForAiAct(task: CliVerboseExecutionTaskLike): string {
  if (!isRecord(task.output)) {
    return compactText(task.output) || compactText(task.thought);
  }

  return (
    compactText(task.output.log) ||
    compactText(task.output.thought) ||
    compactText(task.thought) ||
    summarizeSubGoals(task.output.updateSubGoals) ||
    actionOutputText(task.output.actions) ||
    compactText(task.output.output)
  );
}

function completeTextForAiAct(task: CliVerboseExecutionTaskLike): string {
  if (!isRecord(task.output)) {
    return '';
  }

  const output = compactText(task.output.output);
  if (output) {
    return output;
  }

  return task.output.shouldContinuePlanning === false
    ? plannedTextForAiAct(task)
    : '';
}

function pointFromLocateLike(
  value: Record<string, unknown>,
): [number, number] | undefined {
  const center = value.center;
  if (Array.isArray(center) && center.length >= 2) {
    const x = numberFromUnknown(center[0]);
    const y = numberFromUnknown(center[1]);
    if (x !== undefined && y !== undefined) {
      return [x, y];
    }
  }

  const point = value.point;
  if (Array.isArray(point) && point.length >= 2) {
    const x = numberFromUnknown(point[0]);
    const y = numberFromUnknown(point[1]);
    if (x !== undefined && y !== undefined) {
      return [x, y];
    }
  }

  const locatedPixelBbox = bboxArrayFromProperty(value, 'locatedPixelBbox');
  if (locatedPixelBbox) {
    return centerPointFromBbox(locatedPixelBbox);
  }

  const bbox = bboxArrayFromProperty(value, 'bbox');
  if (bbox) {
    return centerPointFromBbox(bbox);
  }

  return undefined;
}

function bboxFromLocateLike(
  value: Record<string, unknown>,
): [number, number, number, number] | undefined {
  const locatedPixelBbox = bboxArrayFromProperty(value, 'locatedPixelBbox');
  if (locatedPixelBbox) {
    return locatedPixelBbox;
  }

  const bbox = bboxArrayFromProperty(value, 'bbox');
  if (bbox) {
    return bbox;
  }

  if (!isRecord(value.rect)) {
    return undefined;
  }

  const left = numberFromUnknown(value.rect.left);
  const top = numberFromUnknown(value.rect.top);
  const width = numberFromUnknown(value.rect.width);
  const height = numberFromUnknown(value.rect.height);
  if (
    left === undefined ||
    top === undefined ||
    width === undefined ||
    height === undefined
  ) {
    return undefined;
  }

  return [left, top, left + width, top + height];
}

function targetTextFromLocateLike(value: Record<string, unknown>): string {
  return (
    compactText(value.description) ||
    compactText(value.prompt) ||
    summarizeUserInstruction(value)
  );
}

function isLocateLike(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  return (
    'center' in value ||
    'rect' in value ||
    'point' in value ||
    'bbox' in value ||
    'prompt' in value ||
    'description' in value
  );
}

const locatorParamKeys = ['locate', 'from', 'to', 'start', 'end'];

function firstLocateLikeParam(
  param: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(param)) {
    return undefined;
  }

  for (const key of locatorParamKeys) {
    const value = param[key];
    if (isLocateLike(value)) {
      return value;
    }
  }

  return Object.values(param).find(isLocateLike);
}

function hasUnresolvedLocateLikeParam(param: unknown): boolean {
  if (!isRecord(param)) {
    return false;
  }

  return Object.entries(param).some(([key, value]) => {
    if (locatorParamKeys.includes(key) && typeof value === 'string') {
      return true;
    }

    return (
      isLocateLike(value) &&
      !pointFromLocateLike(value) &&
      !bboxFromLocateLike(value)
    );
  });
}

interface AiActActionText {
  action: string;
  running: string;
  done: string;
}

function sleepActionText(
  actionName: string,
  param: unknown,
): AiActActionText | undefined {
  if (actionName !== 'Sleep' || !isRecord(param)) {
    return undefined;
  }

  const timeMs =
    numberFromUnknown(param.timeMs) ??
    numberFromUnknown(param.duration) ??
    numberFromUnknown(param.timeoutMs);
  const action = timeMs ? `Sleep ${integerText(timeMs)}ms` : 'Sleep';
  return {
    action,
    running: action,
    done: 'Sleep',
  };
}

function locateActionText(
  actionName: string,
  param: unknown,
): AiActActionText | undefined {
  const locate = firstLocateLikeParam(param);
  if (!locate) {
    return undefined;
  }

  const point = pointFromLocateLike(locate);
  const bbox = bboxFromLocateLike(locate);
  if (!point) {
    return undefined;
  }

  const target = targetTextFromLocateLike(locate);
  const targetSegment = target ? ` "${target}"` : '';
  const pointSegment = ` at ${formatPoint(point)}`;
  const bboxSegment = bbox ? `, bbox=${formatBbox(bbox)}` : '';
  return {
    action: `${actionName}${targetSegment}${pointSegment}${bboxSegment}`,
    running: `${actionName} at ${formatPoint(point)}`,
    done: actionName,
  };
}

function genericActionText(
  actionName: string,
  param: unknown,
): AiActActionText | undefined {
  if (hasUnresolvedLocateLikeParam(param)) {
    return undefined;
  }

  const paramText = compactText(summarizeParam(param));
  const action = paramText ? `${actionName}: ${paramText}` : actionName;
  return {
    action,
    running: action,
    done: actionName,
  };
}

function actionTextForAiAct(
  task: CliVerboseExecutionTaskLike,
): AiActActionText | undefined {
  const actionName =
    typeof task.subType === 'string' && task.subType.length > 0
      ? task.subType
      : 'Action';
  return (
    sleepActionText(actionName, task.param) ||
    locateActionText(actionName, task.param) ||
    genericActionText(actionName, task.param)
  );
}

function buildAiActTimelineLines(
  executionDump: unknown,
  reportFile?: unknown,
): CliVerboseLine[] {
  if (!isCliVerboseExecutionDumpLike(executionDump)) {
    return [];
  }

  const lines: CliVerboseLine[] = [];
  let planIndex = 0;
  let currentPlan:
    | {
        index: number;
        prefix: string;
      }
    | undefined;

  executionDump.tasks.forEach((task, taskIndex) => {
    const fallbackKey = String(taskIndex + 1);
    if (task.type === 'Planning' && task.subType === 'Plan') {
      planIndex += 1;
      currentPlan = {
        index: planIndex,
        prefix: planPrefix(task, planIndex),
      };
      const keyPrefix = `aiAct:plan:${taskKey(task, fallbackKey)}`;
      const screenshotPath = latestScreenshotPathForAiAct(task, reportFile);
      if (screenshotPath) {
        lines.push({
          key: `${keyPrefix}:thinking`,
          text: `${currentPlan.prefix} Thinking with the latest screenshot: ${screenshotPath}`,
        });
      }

      if (task.status === 'finished') {
        const plannedText = plannedTextForAiAct(task);
        if (plannedText) {
          lines.push({
            key: `${keyPrefix}:planned`,
            text: `${currentPlan.prefix} Planned: ${plannedText}`,
          });
        }

        const completeText = completeTextForAiAct(task);
        if (completeText) {
          lines.push({
            key: `${keyPrefix}:complete`,
            text: `[Midscene][aiAct] Complete: ${completeText}`,
          });
        }
      }
      return;
    }

    if (
      !currentPlan ||
      task.type !== 'Action Space' ||
      task.subType === 'Finished'
    ) {
      return;
    }

    const actionText = actionTextForAiAct(task);
    if (!actionText) {
      return;
    }

    const keyPrefix = `aiAct:action:${taskKey(task, fallbackKey)}`;
    lines.push({
      key: `${keyPrefix}:planned`,
      text: `${currentPlan.prefix} Action: ${actionText.action}`,
    });

    if (task.status === 'running') {
      lines.push({
        key: `${keyPrefix}:running`,
        text: `[Midscene][aiAct][Action] Running: ${actionText.running}`,
      });
    }

    if (task.status === 'finished') {
      const cost =
        typeof task.timing?.cost === 'number'
          ? ` cost=${integerText(task.timing.cost)}ms`
          : '';
      lines.push({
        key: `${keyPrefix}:finished`,
        text: `[Midscene][aiAct][Action] Done: ${actionText.done}${cost}`,
      });
    }

    if (task.status === 'failed') {
      const cost =
        typeof task.timing?.cost === 'number'
          ? ` cost=${integerText(task.timing.cost)}ms`
          : '';
      const error =
        typeof task.errorMessage === 'string' && task.errorMessage.length > 0
          ? ` error=${task.errorMessage}`
          : '';
      lines.push({
        key: `${keyPrefix}:failed`,
        text: `[Midscene][aiAct][Action] Failed: ${actionText.done}${cost}${error}`,
      });
    }
  });

  return lines;
}

function renderCliVerboseEventText(
  event: CliVerboseEvent,
  context: CliVerboseContext,
): string | undefined {
  const command = typeof event.command === 'string' ? event.command : 'command';
  const tool = typeof event.tool === 'string' ? event.tool : undefined;

  switch (event.event) {
    case 'ai_act_start': {
      const prompt = compactText(event.prompt);
      const text = prompt
        ? `[Midscene][aiAct] Start: ${prompt}`
        : '[Midscene][aiAct] Start';
      return renderLinesOnce(context, [
        {
          key: `aiAct:start:${prompt}`,
          text,
        },
      ]);
    }
    case 'command_start': {
      if (isActVerboseEvent(command, tool)) {
        return undefined;
      }
      const args = stringifyArgs(event.args);
      return args
        ? `[Midscene] ${command} started (${args})`
        : `[Midscene] ${command} started`;
    }
    case 'agent_ready':
      if (isActVerboseEvent(command, tool)) {
        return undefined;
      }
      return `[Midscene] ${tool ?? command} ready`;
    case 'dump_update': {
      if (isActVerboseEvent(command, tool)) {
        const lines = Array.isArray(event.aiActTimeline)
          ? event.aiActTimeline.filter(isRecord).flatMap((line) => {
              if (
                typeof line.key === 'string' &&
                typeof line.text === 'string'
              ) {
                return [{ key: line.key, text: line.text }];
              }
              return [];
            })
          : [];
        return renderLinesOnce(context, lines);
      }

      const task = isRecord(event.task) ? event.task : undefined;
      const steps = Array.isArray(event.steps)
        ? event.steps.filter(isRecord)
        : [];
      const execution = isRecord(event.execution) ? event.execution : undefined;
      const executionName =
        typeof execution?.name === 'string' ? execution.name : 'execution';
      const lines =
        steps.length > 0
          ? [
              `[Midscene] Progress: ${executionName} (${steps.length} steps)`,
              ...steps.map((step) => {
                const index =
                  typeof step.index === 'number' &&
                  typeof step.total === 'number'
                    ? `Step ${step.index}/${step.total}`
                    : 'Step';
                const message =
                  typeof step.message === 'string'
                    ? step.message
                    : typeof step.status === 'string'
                      ? step.status
                      : 'updated';
                return `[Midscene] ${index}: ${message}`;
              }),
            ]
          : [
              `[Midscene] Step: ${
                typeof task?.message === 'string'
                  ? task.message
                  : typeof task?.status === 'string'
                    ? task.status
                    : 'updated'
              }`,
            ];
      const screenshots = renderScreenshotList(event.screenshots);
      if (screenshots) {
        lines.push(`[Midscene] Screenshot: ${screenshots}`);
      }
      if (typeof event.report === 'string' && event.report.length > 0) {
        lines.push(`[Midscene] Report: ${event.report}`);
      }
      return lines.join('\n');
    }
    case 'artifact': {
      if (isActVerboseEvent(command, tool)) {
        return undefined;
      }
      const kind = typeof event.kind === 'string' ? event.kind : 'artifact';
      const path = typeof event.path === 'string' ? event.path : undefined;
      return path
        ? `[Midscene] ${kind} saved: ${path}`
        : `[Midscene] ${kind} ready`;
    }
    case 'command_done': {
      if (isActVerboseEvent(command, tool)) {
        return undefined;
      }
      const status = event.status === 'error' ? 'failed' : 'finished';
      const duration =
        typeof event.durationMs === 'number' ? ` in ${event.durationMs}ms` : '';
      const error =
        event.status === 'error' && typeof event.error === 'string'
          ? `: ${event.error}`
          : '';
      return `[Midscene] ${command} ${status}${duration}${error}`;
    }
    default:
      return undefined;
  }
}

export function attachCliVerboseDumpListener(
  agent: DumpUpdateAgent,
  options?: { toolName?: string },
): () => void {
  if (!isCliVerboseEnabled()) {
    return () => {};
  }
  if (typeof agent.addDumpUpdateListener !== 'function') {
    return () => {};
  }

  return agent.addDumpUpdateListener((_dump, executionDump) => {
    const summary = summarizeDumpUpdate(executionDump);
    if (!summary) {
      return;
    }
    const context = getCliVerboseContext();
    const aiActTimeline =
      context.format !== 'jsonl' && options?.toolName === 'act'
        ? buildAiActTimelineLines(executionDump, agent.reportFile)
        : undefined;
    emitCliVerboseEvent({
      event: 'dump_update',
      tool: options?.toolName,
      report: agent.reportFile || undefined,
      ...(aiActTimeline ? { aiActTimeline } : {}),
      ...summary,
    });
  });
}

export { errorMessageOf as cliVerboseErrorMessage };
