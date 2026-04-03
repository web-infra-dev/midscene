import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { extractImageByIdSync } from './dump/html-utils';
import { normalizeScreenshotRef } from './dump/screenshot-store';
import { collectDedupedExecutions, splitReportHtmlByExecution } from './report';
import { reportToMarkdown } from './report-markdown';
import type { MarkdownAttachment } from './report-markdown';
import { ReportActionDump } from './types';

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
  const sourceDir = path.dirname(htmlPath);
  const screenshotsDir = path.join(outputDir, 'screenshots');

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(screenshotsDir, { recursive: true });

  const { baseDump, executions } = collectDedupedExecutions(htmlPath);

  const mergedReport = new ReportActionDump({
    sdkVersion: baseDump.sdkVersion,
    groupName: baseDump.groupName,
    groupDescription: baseDump.groupDescription,
    modelBriefs: baseDump.modelBriefs,
    deviceType: baseDump.deviceType,
    executions,
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
