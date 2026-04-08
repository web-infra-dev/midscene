import {
  copyFileSync,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { resolveScreenshotSource } from './dump/screenshot-store';
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
    screenshotsDir: string;
    writtenFiles: Set<string>;
  },
): void {
  const { suggestedFileName, id, mimeType } = attachment;
  if (opts.writtenFiles.has(suggestedFileName)) return;

  const absolutePath = path.join(opts.screenshotsDir, suggestedFileName);

  const outputRelativePath = `./screenshots/${suggestedFileName}`;
  const sourceRef =
    attachment.filePath !== outputRelativePath
      ? {
          type: 'midscene_screenshot_ref' as const,
          id,
          capturedAt: 0,
          mimeType: (mimeType || 'image/png') as 'image/png' | 'image/jpeg',
          storage: 'file' as const,
          path: attachment.filePath,
        }
      : null;

  const resolved = resolveScreenshotSource(sourceRef, {
    reportPath: opts.htmlPath,
    fallbackId: id,
    fallbackMimeType: (mimeType || 'image/png') as 'image/png' | 'image/jpeg',
  });

  if (resolved.type === 'data-uri') {
    const rawBase64 = resolved.dataUri.replace(
      /^data:image\/[a-zA-Z+]+;base64,/,
      '',
    );
    writeFileSync(absolutePath, Buffer.from(rawBase64, 'base64'));
    opts.writtenFiles.add(suggestedFileName);
    return;
  }

  if (!existsSync(resolved.filePath)) {
    throw new Error(
      `Cannot resolve screenshot "${id}" for markdown attachment from ${opts.htmlPath}`,
    );
  }

  copyFileSync(resolved.filePath, absolutePath);
  opts.writtenFiles.add(suggestedFileName);
}

async function markdownFromReport(
  htmlPath: string,
  outputDir: string,
): Promise<{ markdownFiles: string[]; screenshotFiles: string[] }> {
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

function resolveReportHtmlPath(htmlPath: string): string {
  const normalizedPath = path.resolve(htmlPath);

  if (!existsSync(normalizedPath)) {
    throw new Error(`report-tool: --htmlPath does not exist: ${htmlPath}`);
  }

  const stats = statSync(normalizedPath);
  if (!stats.isDirectory()) {
    return normalizedPath;
  }

  const indexHtmlPath = path.join(normalizedPath, 'index.html');
  if (!existsSync(indexHtmlPath)) {
    throw new Error(
      `report-tool: "${htmlPath}" is not an HTML report file, and no index.html was found under this directory.`,
    );
  }

  return indexHtmlPath;
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

    const resolvedHtmlPath = resolveReportHtmlPath(htmlPath);

    if (action === 'to-markdown') {
      const result = await markdownFromReport(resolvedHtmlPath, outputDir);
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

    const result = splitReportHtmlByExecution({
      htmlPath: resolvedHtmlPath,
      outputDir,
    });

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
