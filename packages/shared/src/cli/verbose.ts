import { basename } from 'node:path';

export const cliVerboseFlag = 'verbose';

const progressEventName = 'midscene_progress';
const cliVerboseContextKey = '__midscene_cli_verbose_context__';

export interface CliVerboseContext {
  enabled: boolean;
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
  storage?: unknown;
  path?: string;
}

interface CliVerboseExecutionTaskLike {
  taskId?: unknown;
  type?: unknown;
  subType?: unknown;
  status?: unknown;
  param?: unknown;
  errorMessage?: unknown;
  timing?: {
    cost?: unknown;
  };
  recorder?: unknown;
  uiContext?: {
    screenshot?: unknown;
  };
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

export function stripVerboseFlag(argv: readonly string[]): {
  rawArgs: string[];
  verbose: boolean;
} {
  const rawArgs: string[] = [];
  let verbose = false;

  for (const arg of argv) {
    if (arg === `--${cliVerboseFlag}`) {
      verbose = true;
      continue;
    }
    rawArgs.push(arg);
  }

  return { rawArgs, verbose };
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
  console.log(JSON.stringify(payload));
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
      if (typeof serialized.path === 'string') {
        screenshot.path = serialized.path;
        screenshot.file = basename(serialized.path);
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

  return {
    execution: {
      id: executionDump.id,
      name: executionDump.name,
      description: compactCliVerboseValue(executionDump.description),
      taskCount: tasks.length,
    },
    task: latestTask
      ? {
          id: latestTask.taskId,
          index: tasks.length,
          total: tasks.length,
          type: latestTask.type,
          subType: latestTask.subType,
          status: latestTask.status,
          param: summarizeParam(latestTask.param),
          error: latestTask.errorMessage,
          durationMs: latestTask.timing?.cost,
        }
      : undefined,
    screenshots: latestTask
      ? collectScreenshotRefs(latestTask).slice(-3)
      : undefined,
  };
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
