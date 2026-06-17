import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

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
  globalContext.current = context;
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

  const text = renderCliVerboseEventText(payload);
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

function safeScreenshotId(value: unknown): string {
  const id = typeof value === 'string' && value.length > 0 ? value : 'shot';
  return id.replace(/[^a-zA-Z0-9._-]/g, '_') || 'shot';
}

function extensionFromScreenshot(
  value: unknown,
  serialized: CliVerboseScreenshotRefLike,
): 'png' | 'jpeg' {
  if (isRecord(value) && typeof value.extension === 'string') {
    return value.extension === 'jpeg' || value.extension === 'jpg'
      ? 'jpeg'
      : 'png';
  }
  return serialized.mimeType === 'image/jpeg' ? 'jpeg' : 'png';
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
): string | undefined {
  if (typeof serialized.path === 'string') {
    return serialized.path;
  }

  const rawBase64 = screenshotRawBase64(value);
  if (!rawBase64) {
    return undefined;
  }

  try {
    const screenshotDir = join(tmpdir(), 'midscene-cli-screenshots');
    if (!existsSync(screenshotDir)) {
      mkdirSync(screenshotDir, { recursive: true });
    }

    const filePath = join(
      screenshotDir,
      `${safeScreenshotId(serialized.id)}.${extensionFromScreenshot(value, serialized)}`,
    );
    if (!existsSync(filePath)) {
      writeFileSync(filePath, Buffer.from(rawBase64, 'base64'));
    }
    return filePath;
  } catch {
    return undefined;
  }
}

function collectScreenshotRefs(value: unknown): Array<Record<string, unknown>> {
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

function renderCliVerboseEventText(event: CliVerboseEvent): string | undefined {
  const command = typeof event.command === 'string' ? event.command : 'command';
  const tool = typeof event.tool === 'string' ? event.tool : undefined;

  switch (event.event) {
    case 'command_start': {
      const args = stringifyArgs(event.args);
      return args
        ? `[Midscene] ${command} started (${args})`
        : `[Midscene] ${command} started`;
    }
    case 'agent_ready':
      return `[Midscene] ${tool ?? command} ready`;
    case 'dump_update': {
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
      const kind = typeof event.kind === 'string' ? event.kind : 'artifact';
      const path = typeof event.path === 'string' ? event.path : undefined;
      return path
        ? `[Midscene] ${kind} saved: ${path}`
        : `[Midscene] ${kind} ready`;
    }
    case 'command_done': {
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
    emitCliVerboseEvent({
      event: 'dump_update',
      tool: options?.toolName,
      report: agent.reportFile || undefined,
      ...summary,
    });
  });
}

export { errorMessageOf as cliVerboseErrorMessage };
