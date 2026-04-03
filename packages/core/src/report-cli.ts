import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { extractImageByIdSync, streamDumpScriptsSync } from './dump/html-utils';
import { normalizeScreenshotRef } from './dump/screenshot-store';
import { splitReportHtmlByExecution } from './report';
import { reportToMarkdown } from './report-markdown';
import type { MarkdownAttachment } from './report-markdown';
import { ReportActionDump } from './types';
import type { IExecutionDump } from './types';

type ReportCliToolResult = {
  isError: boolean;
  content: Array<{
    type: 'text';
    text: string;
  }>;
};

type ReportCliSchema = Record<string, z.ZodTypeAny>;

export interface ReportCliCommandDefinition {
  name: string;
  description: string;
  schema: ReportCliSchema;
  handler: (args: Record<string, unknown>) => Promise<ReportCliToolResult>;
}

export interface ReportCliCommandEntry {
  name: string;
  def: ReportCliCommandDefinition;
}

function writeAttachmentFromReport(
  attachment: MarkdownAttachment,
  opts: {
    htmlPath: string;
    sourceDir: string;
    screenshotsDir: string;
    writtenFiles: Set<string>;
  },
): void {
  const { suggestedFileName, id, mimeType } = attachment;
  if (opts.writtenFiles.has(suggestedFileName)) return;

  const ext = mimeType === 'image/jpeg' ? 'jpeg' : 'png';
  const absolutePath = path.join(opts.screenshotsDir, suggestedFileName);

  const ref = {
    type: 'midscene_screenshot_ref' as const,
    id,
    capturedAt: 0,
    mimeType: (mimeType || 'image/png') as 'image/png' | 'image/jpeg',
    storage: 'inline' as const,
  };

  const normalized = normalizeScreenshotRef(ref);
  if (!normalized) {
    const filePath = path.join(opts.sourceDir, `screenshots/${id}.${ext}`);
    if (existsSync(filePath)) {
      copyFileSync(filePath, absolutePath);
      opts.writtenFiles.add(suggestedFileName);
      return;
    }
    throw new Error(
      `Cannot resolve screenshot "${id}" for markdown attachment`,
    );
  }

  const base64 = extractImageByIdSync(opts.htmlPath, id);
  if (base64) {
    const rawBase64 = base64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    writeFileSync(absolutePath, Buffer.from(rawBase64, 'base64'));
    opts.writtenFiles.add(suggestedFileName);
    return;
  }

  const filePath = path.join(opts.sourceDir, `screenshots/${id}.${ext}`);
  if (existsSync(filePath)) {
    copyFileSync(filePath, absolutePath);
    opts.writtenFiles.add(suggestedFileName);
    return;
  }

  throw new Error(
    `Cannot resolve screenshot "${id}" for markdown attachment from ${opts.htmlPath}`,
  );
}

async function markdownFromReport(
  htmlPath: string,
  outputDir: string,
): Promise<{ markdownFiles: string[]; screenshotFiles: string[] }> {
  const { antiEscapeScriptTag } = await import('@midscene/shared/utils');
  const sourceDir = path.dirname(htmlPath);
  const screenshotsDir = path.join(outputDir, 'screenshots');

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(screenshotsDir, { recursive: true });

  const allExecutions: IExecutionDump[] = [];
  let baseDump: ReportActionDump | null = null;
  const latestSerialByExecutionId = new Map<string, number>();
  let executionSerial = 0;

  streamDumpScriptsSync(htmlPath, (dumpScript) => {
    if (!dumpScript.openTag.includes('data-group-id')) return false;
    const groupedDump = ReportActionDump.fromSerializedString(
      antiEscapeScriptTag(dumpScript.content),
    );
    for (const execution of groupedDump.executions) {
      executionSerial += 1;
      if (execution.id) {
        latestSerialByExecutionId.set(execution.id, executionSerial);
      }
    }
    return false;
  });

  executionSerial = 0;
  streamDumpScriptsSync(htmlPath, (dumpScript) => {
    if (!dumpScript.openTag.includes('data-group-id')) return false;
    const groupedDump = ReportActionDump.fromSerializedString(
      antiEscapeScriptTag(dumpScript.content),
    );
    if (!baseDump) baseDump = groupedDump;
    for (const execution of groupedDump.executions) {
      executionSerial += 1;
      if (
        execution.id &&
        latestSerialByExecutionId.get(execution.id) !== executionSerial
      ) {
        continue;
      }
      allExecutions.push(execution);
    }
    return false;
  });

  if (!baseDump) {
    throw new Error(`No report dump scripts found in ${htmlPath}`);
  }

  const mergedReport = new ReportActionDump({
    sdkVersion: (baseDump as ReportActionDump).sdkVersion,
    groupName: (baseDump as ReportActionDump).groupName,
    groupDescription: (baseDump as ReportActionDump).groupDescription,
    modelBriefs: (baseDump as ReportActionDump).modelBriefs,
    deviceType: (baseDump as ReportActionDump).deviceType,
    executions: allExecutions,
  });

  const result = reportToMarkdown(mergedReport);

  const markdownFiles: string[] = [];
  const writtenScreenshots = new Set<string>();

  const mdPath = path.join(outputDir, 'report.md');
  writeFileSync(mdPath, result.markdown, 'utf-8');
  markdownFiles.push(mdPath);

  for (const attachment of result.attachments) {
    writeAttachmentFromReport(attachment, {
      htmlPath,
      sourceDir,
      screenshotsDir,
      writtenFiles: writtenScreenshots,
    });
  }

  return {
    markdownFiles,
    screenshotFiles: Array.from(writtenScreenshots)
      .sort()
      .map((f) => path.join(screenshotsDir, f)),
  };
}

const reportCommandDefinition: ReportCliCommandDefinition = {
  name: 'report-tool',
  description:
    'Transform Midscene report artifacts, including splitting executions and converting to markdown.',
  schema: {
    action: z
      .enum(['split', 'to-markdown'])
      .optional()
      .describe(
        'Report action to run. Supports: split, to-markdown. Defaults to split.',
      ),
    htmlPath: z
      .string()
      .optional()
      .describe('Input report HTML path (e.g. ./report/index.html)'),
    outputDir: z
      .string()
      .optional()
      .describe('Output directory for generated report artifacts'),
  },
  handler: async (args) => {
    const {
      action = 'split',
      htmlPath,
      outputDir,
    } = args as {
      action?: string;
      htmlPath?: string;
      outputDir?: string;
    };

    if (action !== 'split' && action !== 'to-markdown') {
      throw new Error(
        `report-tool: unsupported --action value "${action}". Currently supported: split, to-markdown`,
      );
    }

    if (!htmlPath) {
      throw new Error(
        `report-tool: --htmlPath is required when --action=${action}`,
      );
    }
    if (!outputDir) {
      throw new Error(
        `report-tool: --outputDir is required when --action=${action}`,
      );
    }

    if (action === 'to-markdown') {
      const result = await markdownFromReport(htmlPath, outputDir);
      return {
        isError: false,
        content: [
          {
            type: 'text',
            text: `Markdown export completed. Generated ${result.markdownFiles.length} markdown file(s) and ${result.screenshotFiles.length} screenshot(s). Output path: ${outputDir}`,
          },
        ],
      };
    }

    const result = splitReportHtmlByExecution({ htmlPath, outputDir });

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: `Report split completed. Generated ${result.executionJsonFiles.length} execution JSON files and ${result.screenshotFiles.length} screenshots. Output path: ${outputDir}`,
        },
      ],
    };
  },
};

export function createReportCliCommands(): ReportCliCommandEntry[] {
  return [
    {
      name: 'report-tool',
      def: reportCommandDefinition,
    },
  ];
}
