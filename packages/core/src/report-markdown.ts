import { basename } from 'node:path';
import { extractInsightParam, paramStr, typeStr } from '@/agent/ui-utils';
import { ScreenshotItem } from '@/screenshot-item';
import type {
  ExecutionDump,
  ExecutionRecorderItem,
  ExecutionTask,
  IExecutionDump,
  IReportActionDump,
  ReportActionDump,
} from '@/types';
import { normalizeScreenshotRef } from './dump/screenshot-store';

export interface MarkdownAttachment {
  id: string;
  suggestedFileName: string;
  mimeType?: string;
  filePath: string;
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
  if (!screenshot || typeof screenshot !== 'object') return undefined;
  const s = screenshot as Record<string, unknown>;
  if (typeof s.base64 === 'string' && s.base64.length > 0) {
    return s.base64;
  }
  return undefined;
}

function screenshotAttachment(
  screenshot: unknown,
  screenshotBaseDir: string,
  executionIndex: number,
  taskIndex: number,
): { markdown: string; attachment: MarkdownAttachment } {
  if (screenshot instanceof ScreenshotItem) {
    const ext = screenshot.extension;
    const suggestedFileName = `execution-${executionIndex + 1}-task-${taskIndex + 1}-${screenshot.id}.${ext}`;
    const filePath = `${screenshotBaseDir}/${suggestedFileName}`;
    return {
      markdown: `\n![task-${taskIndex + 1}](${filePath})`,
      attachment: {
        id: screenshot.id,
        suggestedFileName,
        filePath,
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
    const filePath = ref.path || `${screenshotBaseDir}/${suggestedFileName}`;
    return {
      markdown: `\n![task-${taskIndex + 1}](${filePath})`,
      attachment: {
        id: ref.id,
        suggestedFileName,
        filePath,
        mimeType: ref.mimeType,
        executionIndex,
        taskIndex,
        base64Data: tryExtractBase64(screenshot),
      },
    };
  }

  const base64 = tryExtractBase64(screenshot);
  if (base64) {
    const ext = base64.startsWith('data:image/jpeg') ? 'jpeg' : 'png';
    const id = `restored-${executionIndex + 1}-${taskIndex + 1}`;
    const suggestedFileName = `execution-${executionIndex + 1}-task-${taskIndex + 1}-${id}.${ext}`;
    const filePath = `${screenshotBaseDir}/${suggestedFileName}`;
    return {
      markdown: `\n![task-${taskIndex + 1}](${filePath})`,
      attachment: {
        id,
        suggestedFileName,
        filePath,
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

function recorderMarkdownSection(
  recorder: ExecutionRecorderItem[] | undefined,
  screenshotBaseDir: string,
  executionIndex: number,
  taskIndex: number,
): { lines: string[]; attachments: MarkdownAttachment[] } {
  if (!recorder?.length) {
    return { lines: [], attachments: [] };
  }

  const lines: string[] = ['', '### Recorder'];
  const attachments: MarkdownAttachment[] = [];

  recorder.forEach((item, recorderIndex) => {
    lines.push(
      `- #${recorderIndex + 1} type=${item.type}, ts=${formatTime(item.ts)}, timing=${item.timing || 'N/A'}`,
    );

    if (!item.screenshot) {
      return;
    }

    const imageResult = screenshotAttachment(
      item.screenshot,
      screenshotBaseDir,
      executionIndex,
      taskIndex,
    );

    lines.push(imageResult.markdown);
    attachments.push(imageResult.attachment);
  });

  return { lines, attachments };
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

  execution.tasks.forEach((task, taskIndex) => {
    const title = typeStr(task);
    const detail = safeTaskParam(task);
    const time = resolveTaskTiming(task);

    lines.push(
      '',
      `## ${taskIndex + 1}. ${title}${detail ? ` - ${detail}` : ''}`,
    );
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

    if (task.uiContext?.screenshot) {
      const imageResult = screenshotAttachment(
        task.uiContext.screenshot,
        screenshotBaseDir,
        executionIndex,
        taskIndex,
      );

      lines.push(imageResult.markdown);
      attachments.push(imageResult.attachment);
    }

    const recorderSection = recorderMarkdownSection(
      task.recorder,
      screenshotBaseDir,
      executionIndex,
      taskIndex,
    );
    if (recorderSection.lines.length) {
      lines.push(...recorderSection.lines);
      attachments.push(...recorderSection.attachments);
    }
  });

  return {
    markdown: lines.join('\n'),
    attachments,
  };
}

function reportFileName(
  execution: IExecutionDump,
  executionIndex: number,
): string {
  const safeName =
    execution.name
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-_]/g, '') || `execution-${executionIndex + 1}`;
  return `${executionIndex + 1}-${basename(safeName)}.md`;
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
      executionIndex: index,
      executionName: execution.name,
      markdown: rendered.markdown,
      attachments: rendered.attachments,
      suggestedFileName: reportFileName(execution, index),
    };
  });

  const attachments = executionResults.flatMap((item) => item.attachments);

  const header = [
    `# ${reportDump.groupName}`,
    reportDump.groupDescription ? `\n${reportDump.groupDescription}` : '',
    `\n- SDK Version: ${reportDump.sdkVersion}`,
    `- Execution count: ${reportDump.executions.length}`,
    '\n## Suggested execution markdown files',
    ...executionResults.map(
      (item) => `- ${item.suggestedFileName} (${item.executionName})`,
    ),
  ]
    .filter(Boolean)
    .join('\n');

  return {
    markdown: `${header}\n\n${executionResults.map((item) => item.markdown).join('\n\n---\n\n')}`,
    attachments,
  };
}
