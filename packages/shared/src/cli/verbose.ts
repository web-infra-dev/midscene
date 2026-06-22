import {
  type CliAiActProgressEvent,
  type CliVerboseLine,
  buildAiActProgressEventLines,
  normalizeAiActProgressEventForCli,
} from './verbose-ai-act';
import {
  type CliVerboseScreenshotCollectOptions,
  type CliVerboseScreenshotExportMode,
  collectScreenshotRefs,
  renderScreenshotList,
} from './verbose-screenshot';

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
  addAiActProgressListener?: (
    listener: (event: CliAiActProgressEvent) => void,
  ) => () => void;
  reportFile?: string | null;
};

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

function isCliVerboseExecutionDumpLike(
  value: unknown,
): value is CliVerboseExecutionDumpLike {
  return isRecord(value) && Array.isArray(value.tasks);
}

function summarizeDumpUpdate(
  executionDump: unknown,
  screenshotOptions: CliVerboseScreenshotCollectOptions = {},
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
      screenshots: collectScreenshotRefs(task, screenshotOptions).slice(-3),
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
    screenshots: collectScreenshotRefs(tasks, screenshotOptions).slice(-5),
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

function renderCliVerboseEventText(
  event: CliVerboseEvent,
  context: CliVerboseContext,
): string | undefined {
  const command = typeof event.command === 'string' ? event.command : 'command';
  const tool = typeof event.tool === 'string' ? event.tool : undefined;

  switch (event.event) {
    case 'ai_act_progress': {
      if (!isActVerboseEvent(command, tool)) {
        return undefined;
      }
      const progressEvent = isRecord(event.aiAct) ? event.aiAct : undefined;
      if (!progressEvent) {
        return undefined;
      }
      return renderLinesOnce(
        context,
        buildAiActProgressEventLines(progressEvent),
      );
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
        return undefined;
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
        if (event.status === 'error') {
          const error =
            typeof event.error === 'string' && event.error.length > 0
              ? `: ${event.error}`
              : '';
          return renderLinesOnce(context, [
            {
              key: `aiAct:command_failed:${event.error ?? 'unknown'}`,
              text: `[Midscene][aiAct] Failed${error}`,
            },
          ]);
        }
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

  const isActTool = options?.toolName === 'act';
  const screenshotExportCache = new Map<string, string>();

  if (isActTool && typeof agent.addAiActProgressListener === 'function') {
    return agent.addAiActProgressListener((aiActEvent) => {
      const context = getCliVerboseContext();
      const isTextMode = context.format !== 'jsonl';
      const progress = normalizeAiActProgressEventForCli(aiActEvent, {
        reportFile: agent.reportFile,
        exportMode: isTextMode ? 'report' : 'none',
        cache: screenshotExportCache,
      });
      if (!progress) {
        return;
      }
      emitCliVerboseEvent({
        event: 'ai_act_progress',
        tool: options?.toolName,
        aiAct: progress,
      });
    });
  }

  if (isActTool) {
    return () => {};
  }

  if (typeof agent.addDumpUpdateListener !== 'function') {
    return () => {};
  }

  return agent.addDumpUpdateListener((_dump, executionDump) => {
    const context = getCliVerboseContext();
    const isTextMode = context.format !== 'jsonl';
    const summaryExportMode: CliVerboseScreenshotExportMode =
      isTextMode && !isActTool ? 'tmp' : 'none';
    const summary = summarizeDumpUpdate(executionDump, {
      exportMode: summaryExportMode,
      cache: screenshotExportCache,
    });
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
