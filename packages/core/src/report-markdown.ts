import { extractInsightParam, paramStr, typeStr } from '@/agent/ui-utils';
import { ScreenshotItem } from '@/screenshot-item';
import type {
  AIUsageInfo,
  ExecutionDump,
  ExecutionTask,
  IExecutionDump,
  IReportActionDump,
  ModelBrief,
  ReportActionDump,
} from '@/types';
import type { ScreenshotRef } from './dump/screenshot-store';
import { normalizeScreenshotRef } from './dump/screenshot-store';

const screenshotDataUrlPattern =
  /^data:image\/(png|jpeg|jpg);base64,([\s\S]*)$/i;
const rawBase64BodyPattern = /^[a-zA-Z0-9+/=\s]+$/;
const jsonContextMaxStringLength = 12_000;

type ExecutionTaskWithExtraUsage = ExecutionTask & {
  cacheUsage?: AIUsageInfo;
  searchAreaUsage?: AIUsageInfo;
  reasoning_content?: string;
};

interface UsageTotals {
  calls: number;
  prompt: number;
  cachedInput: number;
  completion: number;
  total: number;
  timeCost: number;
}

export interface MarkdownAttachment {
  id: string;
  /**
   * Stable, prefixed file name for the exported copy. The markdown image link
   * always points at `${screenshotBaseDir}/${suggestedFileName}`, so consumers
   * write the screenshot under this name to keep links in sync. See #2392.
   */
  suggestedFileName: string;
  mimeType?: string;
  /**
   * Reference to the screenshot in the source report, used to locate the
   * original bytes when copying them to the exported name. Absent for in-memory
   * screenshots, which carry their data in `base64Data` instead.
   */
  sourceRef?: ScreenshotRef;
  executionIndex: number;
  taskIndex: number;
  /** Populated when screenshot data is available in memory (e.g. browser context). */
  base64Data?: string;
}

export interface ExecutionMarkdownOptions {
  screenshotBaseDir?: string;
}

export interface ExecutionMarkdownResult {
  markdown: string;
  attachments: MarkdownAttachment[];
}

export interface ReportMarkdownResult {
  markdown: string;
  attachments: MarkdownAttachment[];
}

function toExecutionDump(
  execution: ExecutionDump | IExecutionDump,
): IExecutionDump {
  if (!execution || typeof execution !== 'object') {
    throw new Error('executionToMarkdown: execution is required');
  }

  if (!Array.isArray(execution.tasks)) {
    throw new Error('executionToMarkdown: execution.tasks must be an array');
  }

  if (!execution.name) {
    throw new Error('executionToMarkdown: execution.name is required');
  }

  return execution;
}

function toReportDump(
  report: ReportActionDump | IReportActionDump,
): IReportActionDump {
  if (!report || typeof report !== 'object') {
    throw new Error('reportToMarkdown: report is required');
  }

  if (!Array.isArray(report.executions)) {
    throw new Error('reportToMarkdown: report.executions must be an array');
  }

  return report;
}

function formatTime(ts?: number): string {
  if (typeof ts !== 'number' || Number.isNaN(ts)) {
    return 'N/A';
  }
  return new Date(ts).toISOString();
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return 'N/A';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'N/A';
  }
  return String(value);
}

function escapeTableCell(value: unknown): string {
  return formatValue(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function markdownTable(headers: string[], rows: unknown[][]): string[] {
  return [
    `| ${headers.map(escapeTableCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapeTableCell).join(' | ')} |`),
  ];
}

function modelBriefRows(modelBriefs: ModelBrief[]): unknown[][] {
  return modelBriefs.map((brief) => [
    brief.intent || 'default',
    brief.name || 'N/A',
    brief.modelDescription || 'N/A',
  ]);
}

function modelRowsFromUsage(report: IReportActionDump): unknown[][] {
  const rows = new Map<string, unknown[]>();
  const addUsage = (source: string, usage?: AIUsageInfo) => {
    if (!hasUsage(usage)) return;
    const intent = usage.intent || source;
    const model = usage.model_name || usage.response_model_name;
    const description = usage.model_description;
    const key = `${intent}\0${model || ''}\0${description || ''}`;
    if (rows.has(key)) {
      return;
    }
    rows.set(key, [intent, model || 'N/A', description || 'N/A']);
  };

  for (const execution of report.executions) {
    for (const task of execution.tasks) {
      const taskWithUsage = task as ExecutionTaskWithExtraUsage;
      addUsage('main', taskWithUsage.usage);
      addUsage('cache', taskWithUsage.cacheUsage);
      addUsage('searchArea', taskWithUsage.searchAreaUsage);
    }
  }

  return Array.from(rows.values());
}

function usageValue(usage: AIUsageInfo | undefined, key: string): number {
  const value = usage?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function hasUsage(usage: AIUsageInfo | undefined): usage is AIUsageInfo {
  if (!usage) return false;
  return [
    'intent',
    'model_name',
    'model_description',
    'prompt_tokens',
    'cached_input',
    'completion_tokens',
    'total_tokens',
    'time_cost',
    'request_id',
  ].some((key) => usage[key] !== undefined && usage[key] !== null);
}

function usageTotalTokens(usage: AIUsageInfo): number {
  const explicitTotal = usageValue(usage, 'total_tokens');
  if (explicitTotal > 0) {
    return explicitTotal;
  }
  return (
    usageValue(usage, 'prompt_tokens') + usageValue(usage, 'completion_tokens')
  );
}

function usageModelName(usage: AIUsageInfo): string {
  return (
    usage.model_name ||
    usage.response_model_name ||
    usage.model_description ||
    usage.intent ||
    'Unknown'
  );
}

function usageRowsForTask(task: ExecutionTask): unknown[][] {
  const taskWithUsage = task as ExecutionTaskWithExtraUsage;
  const rows: unknown[][] = [];
  const appendUsage = (source: string, usage?: AIUsageInfo) => {
    if (!hasUsage(usage)) return;
    rows.push([
      source,
      usage.intent,
      usage.model_name || usage.response_model_name,
      usage.model_description,
      usageValue(usage, 'prompt_tokens'),
      usageValue(usage, 'cached_input'),
      usageValue(usage, 'completion_tokens'),
      usageTotalTokens(usage),
      usageValue(usage, 'time_cost'),
      usage.request_id,
    ]);
  };

  appendUsage('main', taskWithUsage.usage);
  appendUsage('cache', taskWithUsage.cacheUsage);
  appendUsage('searchArea', taskWithUsage.searchAreaUsage);
  return rows;
}

function collectUsageTotals(
  report: IReportActionDump,
): Map<string, UsageTotals> {
  const totalsByModel = new Map<string, UsageTotals>();
  const addUsage = (usage?: AIUsageInfo) => {
    if (!hasUsage(usage)) return;
    const modelName = usageModelName(usage);
    const current = totalsByModel.get(modelName) ?? {
      calls: 0,
      prompt: 0,
      cachedInput: 0,
      completion: 0,
      total: 0,
      timeCost: 0,
    };

    totalsByModel.set(modelName, {
      calls: current.calls + 1,
      prompt: current.prompt + usageValue(usage, 'prompt_tokens'),
      cachedInput: current.cachedInput + usageValue(usage, 'cached_input'),
      completion: current.completion + usageValue(usage, 'completion_tokens'),
      total: current.total + usageTotalTokens(usage),
      timeCost: current.timeCost + usageValue(usage, 'time_cost'),
    });
  };

  for (const execution of report.executions) {
    for (const task of execution.tasks) {
      const taskWithUsage = task as ExecutionTaskWithExtraUsage;
      addUsage(taskWithUsage.usage);
      addUsage(taskWithUsage.cacheUsage);
      addUsage(taskWithUsage.searchAreaUsage);
    }
  }

  return totalsByModel;
}

function sanitizeJsonForMarkdown(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === 'string') {
    if (
      screenshotDataUrlPattern.test(value) ||
      value.length > 1_000_000 ||
      /^[a-zA-Z0-9+/=\s]{100000,}$/.test(value)
    ) {
      return `[omitted image/base64 string, length=${value.length}]`;
    }
    if (value.length > jsonContextMaxStringLength) {
      return `${value.slice(0, jsonContextMaxStringLength)}\n[truncated, original length=${value.length}]`;
    }
    return value;
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'function') {
    return '[omitted function]';
  }

  if (typeof value !== 'object' || value === undefined) {
    return undefined;
  }

  if (seen.has(value)) {
    return '[omitted circular reference]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonForMarkdown(item, seen));
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(input)) {
    if (entry === undefined || typeof entry === 'function') {
      continue;
    }
    if (
      typeof entry === 'string' &&
      /(^|_|-)(base64|screenshotBase64|imageBase64)$/i.test(key)
    ) {
      output[key] = `[omitted base64 string, length=${entry.length}]`;
      continue;
    }
    output[key] = sanitizeJsonForMarkdown(entry, seen);
  }
  seen.delete(value);
  return output;
}

function appendJsonSection(
  lines: string[],
  title: string,
  value: unknown,
): void {
  if (value === undefined || value === null || value === '') {
    return;
  }
  const sanitized = sanitizeJsonForMarkdown(value);
  if (sanitized === undefined) {
    return;
  }

  lines.push('', `### ${title}`, '', '```json');
  lines.push(JSON.stringify(sanitized, null, 2));
  lines.push('```');
}

function appendTextSection(
  lines: string[],
  title: string,
  value: unknown,
): void {
  if (typeof value !== 'string' || !value.trim()) {
    return;
  }
  lines.push('', `### ${title}`, '', '```text');
  lines.push(value.replace(/```/g, '` ` `'));
  lines.push('```');
}

function resolveTaskTiming(task: ExecutionTask): {
  start?: number;
  end?: number;
  cost?: number;
} {
  const timing = task.timing;
  if (!timing) {
    return {};
  }

  const start = timing.start ?? timing.callAiStart ?? timing.callActionStart;
  const end =
    timing.end ??
    timing.callAiEnd ??
    timing.callActionEnd ??
    timing.captureAfterCallingSnapshotEnd;
  const cost =
    timing.cost ??
    (typeof start === 'number' && typeof end === 'number'
      ? end - start
      : undefined);

  return { start, end, cost };
}

function safeTaskParam(task: ExecutionTask): string {
  const readable = paramStr(task);
  if (readable) {
    return readable;
  }

  if (task.type === 'Insight') {
    return extractInsightParam((task as any).param).content;
  }

  return '';
}

function formatSize(
  size?: { width?: number; height?: number } | null,
): string | undefined {
  if (
    !size ||
    typeof size.width !== 'number' ||
    typeof size.height !== 'number' ||
    Number.isNaN(size.width) ||
    Number.isNaN(size.height)
  ) {
    return undefined;
  }

  return `${size.width} x ${size.height}`;
}

function extractLocateCenter(
  task: ExecutionTask,
): [number, number] | undefined {
  const outputCenter = (task.output as { element?: { center?: unknown } })
    ?.element?.center;
  if (
    Array.isArray(outputCenter) &&
    outputCenter.length >= 2 &&
    typeof outputCenter[0] === 'number' &&
    typeof outputCenter[1] === 'number'
  ) {
    return [outputCenter[0], outputCenter[1]];
  }

  const paramLocateCenter = (task.param as { locate?: { center?: unknown } })
    ?.locate?.center;
  if (
    Array.isArray(paramLocateCenter) &&
    paramLocateCenter.length >= 2 &&
    typeof paramLocateCenter[0] === 'number' &&
    typeof paramLocateCenter[1] === 'number'
  ) {
    return [paramLocateCenter[0], paramLocateCenter[1]];
  }

  const paramCenter = (task.param as { center?: unknown })?.center;
  if (
    Array.isArray(paramCenter) &&
    paramCenter.length >= 2 &&
    typeof paramCenter[0] === 'number' &&
    typeof paramCenter[1] === 'number'
  ) {
    return [paramCenter[0], paramCenter[1]];
  }

  return undefined;
}

function tryExtractBase64(screenshot: unknown): string | undefined {
  if (typeof screenshot === 'string') {
    const trimmedScreenshot = screenshot.trim();
    const dataUrlMatch = trimmedScreenshot.match(screenshotDataUrlPattern);
    if (dataUrlMatch) {
      const format = dataUrlMatch[1].toLowerCase() === 'jpg' ? 'jpeg' : 'png';
      const base64Body = dataUrlMatch[2].replace(/\s/g, '');
      if (!base64Body) {
        return undefined;
      }
      return `data:image/${format};base64,${base64Body}`;
    }

    if (
      trimmedScreenshot.startsWith('data:') ||
      !rawBase64BodyPattern.test(trimmedScreenshot)
    ) {
      return undefined;
    }

    const base64Body = trimmedScreenshot.replace(/\s/g, '');
    return base64Body ? `data:image/png;base64,${base64Body}` : undefined;
  }

  if (!screenshot || typeof screenshot !== 'object') return undefined;
  const s = screenshot as Record<string, unknown>;
  if (typeof s.base64 === 'string' && s.base64.length > 0) {
    return s.base64;
  }
  return undefined;
}

function restoredSourceRef(screenshot: unknown): ScreenshotRef | undefined {
  if (!screenshot || typeof screenshot !== 'object') {
    return undefined;
  }

  const sourceRef = (screenshot as Record<string, unknown>).sourceRef;
  return normalizeScreenshotRef(sourceRef) ?? undefined;
}

function screenshotAttachment(
  screenshot: unknown,
  screenshotBaseDir: string,
  executionIndex: number,
  taskIndex: number,
  options?: {
    fallbackIdSuffix?: string;
    label?: string;
  },
): { markdown: string; attachment: MarkdownAttachment } {
  const markdownLabel = options?.label || `task-${taskIndex + 1}`;

  if (screenshot instanceof ScreenshotItem) {
    const ext = screenshot.extension;
    const suggestedFileName = `execution-${executionIndex + 1}-task-${taskIndex + 1}-${screenshot.id}.${ext}`;
    return {
      markdown: `\n![${markdownLabel}](${screenshotBaseDir}/${suggestedFileName})`,
      attachment: {
        id: screenshot.id,
        suggestedFileName,
        mimeType: `image/${ext === 'jpeg' ? 'jpeg' : 'png'}`,
        executionIndex,
        taskIndex,
        base64Data: tryExtractBase64(screenshot),
      },
    };
  }

  const ref = normalizeScreenshotRef(screenshot);
  if (ref) {
    const ext = ref.mimeType === 'image/jpeg' ? 'jpeg' : 'png';
    const suggestedFileName = `execution-${executionIndex + 1}-task-${taskIndex + 1}-${ref.id}.${ext}`;
    return {
      markdown: `\n![${markdownLabel}](${screenshotBaseDir}/${suggestedFileName})`,
      attachment: {
        id: ref.id,
        suggestedFileName,
        sourceRef: ref,
        mimeType: ref.mimeType,
        executionIndex,
        taskIndex,
        base64Data: tryExtractBase64(screenshot),
      },
    };
  }

  const sourceRef = restoredSourceRef(screenshot);
  if (sourceRef) {
    const ext = sourceRef.mimeType === 'image/jpeg' ? 'jpeg' : 'png';
    const suggestedFileName = `execution-${executionIndex + 1}-task-${taskIndex + 1}-${sourceRef.id}.${ext}`;
    return {
      markdown: `\n![${markdownLabel}](${screenshotBaseDir}/${suggestedFileName})`,
      attachment: {
        id: sourceRef.id,
        suggestedFileName,
        sourceRef,
        mimeType: sourceRef.mimeType,
        executionIndex,
        taskIndex,
        base64Data: tryExtractBase64(screenshot),
      },
    };
  }

  const base64 = tryExtractBase64(screenshot);
  if (base64) {
    const ext = base64.startsWith('data:image/jpeg') ? 'jpeg' : 'png';
    const idSuffix = options?.fallbackIdSuffix
      ? `-${options.fallbackIdSuffix}`
      : '';
    const id = `restored-${executionIndex + 1}-${taskIndex + 1}${idSuffix}`;
    const suggestedFileName = `execution-${executionIndex + 1}-task-${taskIndex + 1}-${id}.${ext}`;
    return {
      markdown: `\n![${markdownLabel}](${screenshotBaseDir}/${suggestedFileName})`,
      attachment: {
        id,
        suggestedFileName,
        mimeType: `image/${ext}`,
        executionIndex,
        taskIndex,
        base64Data: base64,
      },
    };
  }

  throw new Error(
    `executionToMarkdown: missing screenshot for execution #${executionIndex + 1} task #${taskIndex + 1}`,
  );
}

function imageLabelSuffix(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'screenshot'
  );
}

function screenshotsMarkdownSection(
  task: ExecutionTask,
  screenshotBaseDir: string,
  executionIndex: number,
  taskIndex: number,
): { lines: string[]; attachments: MarkdownAttachment[] } {
  const lines: string[] = ['', '### Screenshots'];
  const attachments: MarkdownAttachment[] = [];
  let screenshotIndex = 0;

  if (task.uiContext?.screenshot) {
    const imageResult = screenshotAttachment(
      task.uiContext.screenshot,
      screenshotBaseDir,
      executionIndex,
      taskIndex,
      {
        fallbackIdSuffix: 'ui-context',
        label: `task-${taskIndex + 1}-ui-context`,
      },
    );
    const time = resolveTaskTiming(task);
    screenshotIndex += 1;
    lines.push(
      `- #${screenshotIndex} type=ui-context, ts=${formatTime(time.start)}, timing=ui-context`,
    );
    lines.push(imageResult.markdown);
    attachments.push(imageResult.attachment);
  }

  task.recorder?.forEach((item, recorderIndex) => {
    if (!item.screenshot) {
      return;
    }

    const descriptionText = item.description
      ? `, description=${item.description}`
      : '';
    const timing = item.timing || 'N/A';
    screenshotIndex += 1;
    lines.push(
      `- #${screenshotIndex} type=${item.type}, ts=${formatTime(item.ts)}, timing=${timing}${descriptionText}`,
    );

    const imageResult = screenshotAttachment(
      item.screenshot,
      screenshotBaseDir,
      executionIndex,
      taskIndex,
      {
        fallbackIdSuffix: `recorder-${recorderIndex + 1}`,
        label: `task-${taskIndex + 1}-${imageLabelSuffix(timing)}`,
      },
    );

    lines.push(imageResult.markdown);
    attachments.push(imageResult.attachment);
  });

  return screenshotIndex > 0
    ? { lines, attachments }
    : { lines: [], attachments };
}

function renderExecution(
  executionRaw: ExecutionDump | IExecutionDump,
  executionIndex: number,
  options?: ExecutionMarkdownOptions,
): ExecutionMarkdownResult {
  const execution = toExecutionDump(executionRaw);
  const screenshotBaseDir = options?.screenshotBaseDir ?? './screenshots';

  const lines: string[] = [];
  const attachments: MarkdownAttachment[] = [];

  lines.push(`# ${execution.name}`);
  if (execution.description) {
    lines.push('', execution.description);
  }

  lines.push('', `- Execution start: ${formatTime(execution.logTime)}`);
  lines.push(`- Task count: ${execution.tasks.length}`);
  if (execution.aiActContext) {
    appendTextSection(lines, 'AI Action Context', execution.aiActContext);
  }

  execution.tasks.forEach((task, taskIndex) => {
    const title = typeStr(task);
    const detail = safeTaskParam(task);
    const time = resolveTaskTiming(task);

    lines.push(
      '',
      `## ${taskIndex + 1}. ${title}${detail ? ` - ${detail}` : ''}`,
    );
    lines.push(`- Task ID: ${task.taskId || 'N/A'}`);
    lines.push(`- Type: ${task.type || 'N/A'}`);
    lines.push(`- SubType: ${task.subType || 'N/A'}`);
    lines.push(`- Status: ${task.status || 'unknown'}`);
    lines.push(`- Start: ${formatTime(time.start)}`);
    lines.push(`- End: ${formatTime(time.end)}`);
    lines.push(
      `- Cost(ms): ${typeof time.cost === 'number' ? time.cost : 'N/A'}`,
    );
    lines.push(
      `- Screen size: ${formatSize(task.uiContext?.shotSize) || 'N/A'}`,
    );

    if (task.subType === 'Locate') {
      const locateCenter = extractLocateCenter(task);
      if (locateCenter) {
        lines.push(`- Locate center: (${locateCenter[0]}, ${locateCenter[1]})`);
      }
    }

    if (task.errorMessage) {
      lines.push(`- Error: ${task.errorMessage}`);
    }

    const usageRows = usageRowsForTask(task);
    if (usageRows.length) {
      lines.push('', '### Model Usage');
      lines.push(
        ...markdownTable(
          [
            'Source',
            'Intent',
            'Model',
            'Description',
            'Prompt Tokens',
            'Cached Input',
            'Completion Tokens',
            'Total Tokens',
            'Time Cost(ms)',
            'Request ID',
          ],
          usageRows,
        ),
      );
    }

    appendJsonSection(lines, 'Param', task.param);
    appendJsonSection(lines, 'Output', task.output);
    appendJsonSection(lines, 'Log', task.log);
    appendTextSection(lines, 'Thought', task.thought);
    appendTextSection(
      lines,
      'Reasoning Content',
      (task as ExecutionTaskWithExtraUsage).reasoning_content,
    );

    const screenshotsSection = screenshotsMarkdownSection(
      task,
      screenshotBaseDir,
      executionIndex,
      taskIndex,
    );
    if (screenshotsSection.lines.length) {
      lines.push(...screenshotsSection.lines);
      attachments.push(...screenshotsSection.attachments);
    }
  });

  return {
    markdown: lines.join('\n'),
    attachments,
  };
}

export function executionToMarkdown(
  execution: ExecutionDump | IExecutionDump,
  options?: ExecutionMarkdownOptions,
): ExecutionMarkdownResult {
  return renderExecution(execution, 0, options);
}

export function reportToMarkdown(
  report: ReportActionDump | IReportActionDump,
): ReportMarkdownResult {
  const reportDump = toReportDump(report);

  const executionResults = reportDump.executions.map((execution, index) => {
    const rendered = renderExecution(execution, index);
    return {
      markdown: rendered.markdown,
      attachments: rendered.attachments,
    };
  });

  const attachments = executionResults.flatMap((item) => item.attachments);
  const usageTotals = collectUsageTotals(reportDump);
  const modelRows = reportDump.modelBriefs?.length
    ? modelBriefRows(reportDump.modelBriefs)
    : modelRowsFromUsage(reportDump);

  const modelInfoLines = [
    '\n## Model Info',
    ...(modelRows.length
      ? markdownTable(['Intent', 'Model', 'Description'], modelRows)
      : ['- No model metadata recorded.']),
  ];

  const tokenSummaryLines = [
    '\n## Token Usage Summary',
    ...(usageTotals.size
      ? markdownTable(
          [
            'Model',
            'Calls',
            'Prompt Tokens',
            'Cached Input',
            'Completion Tokens',
            'Total Tokens',
            'Time Cost(ms)',
          ],
          Array.from(usageTotals.entries()).map(([modelName, totals]) => [
            modelName,
            totals.calls,
            totals.prompt,
            totals.cachedInput,
            totals.completion,
            totals.total,
            totals.timeCost,
          ]),
        )
      : ['- No token usage recorded.']),
  ];

  const header = [
    `# ${reportDump.groupName}`,
    reportDump.groupDescription ? `\n${reportDump.groupDescription}` : '',
    `\n- SDK Version: ${reportDump.sdkVersion}`,
    reportDump.deviceType ? `- Device Type: ${reportDump.deviceType}` : '',
    `- Execution count: ${reportDump.executions.length}`,
    ...modelInfoLines,
    ...tokenSummaryLines,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    markdown: `${header}\n\n${executionResults.map((item) => item.markdown).join('\n\n---\n\n')}`,
    attachments,
  };
}
