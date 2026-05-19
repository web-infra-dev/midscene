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
import {
  ReportMergingTool,
  collectDedupedExecutions,
  splitReportHtmlByExecution,
} from './report';
import { reportToMarkdown } from './report-markdown';
import type { MarkdownAttachment } from './report-markdown';
import type { ReportFileAttributes, TestStatus } from './types';
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

export type ConsumeReportFileAction = 'split' | 'to-markdown' | 'merge';

export interface ConsumeReportFileOptions {
  htmlPath: string;
  outputDir: string;
}

export type SplitReportFileOptions = ConsumeReportFileOptions;
export type ReportFileToMarkdownOptions = ConsumeReportFileOptions;

export interface MergeReportFilesOptions {
  htmlPaths: string[];
  outputDir?: string;
  outputName?: string;
  overwrite?: boolean;
}

export interface MergeReportFilesResult {
  mergedReportPath: string;
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

export function splitReportFile(options: SplitReportFileOptions): {
  executionJsonFiles: string[];
  screenshotFiles: string[];
} {
  const { htmlPath, outputDir } = options;
  if (!htmlPath) {
    throw new Error('splitReportFile: htmlPath is required');
  }

  if (!outputDir) {
    throw new Error('splitReportFile: outputDir is required');
  }

  const resolvedHtmlPath = resolveReportHtmlPath(htmlPath);
  return splitReportHtmlByExecution({
    htmlPath: resolvedHtmlPath,
    outputDir,
  });
}

export async function reportFileToMarkdown(
  options: ReportFileToMarkdownOptions,
): Promise<{ markdownFiles: string[]; screenshotFiles: string[] }> {
  const { htmlPath, outputDir } = options;
  if (!htmlPath) {
    throw new Error('reportFileToMarkdown: htmlPath is required');
  }

  if (!outputDir) {
    throw new Error('reportFileToMarkdown: outputDir is required');
  }

  const resolvedHtmlPath = resolveReportHtmlPath(htmlPath);
  return markdownFromReport(resolvedHtmlPath, outputDir);
}

function deriveReportAttributesFromHtml(
  htmlPath: string,
  index: number,
): ReportFileAttributes {
  const fallbackId = `${path.basename(path.dirname(htmlPath)) || path.basename(htmlPath, path.extname(htmlPath))}-${index + 1}`;
  try {
    const { baseDump } = collectDedupedExecutions(htmlPath);
    return {
      testId: fallbackId,
      testTitle: baseDump.groupName || fallbackId,
      testDescription: baseDump.groupDescription ?? '',
      testDuration: 0,
      testStatus: 'passed' as TestStatus,
    };
  } catch {
    return {
      testId: fallbackId,
      testTitle: fallbackId,
      testDescription: '',
      testDuration: 0,
      testStatus: 'passed' as TestStatus,
    };
  }
}

export function mergeReportFiles(
  options: MergeReportFilesOptions,
): MergeReportFilesResult {
  const { htmlPaths, outputDir, outputName, overwrite = false } = options;
  if (!htmlPaths || htmlPaths.length === 0) {
    throw new Error('mergeReportFiles: htmlPaths is required');
  }

  const resolvedPaths = htmlPaths.map((p) => resolveReportHtmlPath(p));

  const tool = new ReportMergingTool();
  resolvedPaths.forEach((htmlPath, index) => {
    tool.append({
      reportFilePath: htmlPath,
      reportAttributes: deriveReportAttributesFromHtml(htmlPath, index),
    });
  });

  const mergedReportPath = tool.mergeReports(outputName ?? 'AUTO', {
    overwrite,
    outputDir,
  });

  if (!mergedReportPath) {
    throw new Error('mergeReportFiles: failed to produce a merged report');
  }

  return { mergedReportPath };
}

function normalizeHtmlPathsArg(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (Array.isArray(raw)) {
    return raw.filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    );
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (p): p is string => typeof p === 'string' && p.length > 0,
          );
        }
      } catch {
        // fall through to comma-split
      }
    }
    return trimmed
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }
  return undefined;
}

const reportCommandDefinition: ReportCliCommandDefinition = {
  name: 'report-tool',
  description:
    'Transform Midscene report artifacts, including splitting executions, converting to markdown, and merging multiple reports.',
  schema: {
    action: z
      .enum(['split', 'to-markdown', 'merge'])
      .optional()
      .describe(
        'Report action to run. Supports: split, to-markdown, merge. Defaults to split.',
      ),
    htmlPath: z
      .string()
      .optional()
      .describe(
        'Input report HTML path (e.g. ./report/index.html). Used by split and to-markdown.',
      ),
    htmlPaths: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe(
        'Input report HTML paths for the merge action. Accepts a JSON array (e.g. \'["a/index.html","b.html"]\') or a comma-separated list.',
      ),
    outputDir: z
      .string()
      .optional()
      .describe(
        'Output directory for generated report artifacts. For merge, defaults to the Midscene report directory.',
      ),
    outputName: z
      .string()
      .optional()
      .describe(
        'Output report file/directory name (without .html) for the merge action. Defaults to an auto-generated name.',
      ),
    overwrite: z
      .union([z.boolean(), z.string()])
      .optional()
      .describe(
        'Overwrite the existing merged report file if present (merge action only).',
      ),
  },
  handler: async (args) => {
    const {
      action = 'split',
      htmlPath,
      htmlPaths,
      outputDir,
      outputName,
      overwrite,
    } = args as {
      action?: string;
      htmlPath?: string;
      htmlPaths?: unknown;
      outputDir?: string;
      outputName?: string;
      overwrite?: unknown;
    };
    if (action !== 'split' && action !== 'to-markdown' && action !== 'merge') {
      throw new Error(
        `report-tool: unsupported --action value "${action}". Currently supported: split, to-markdown, merge`,
      );
    }

    if (action === 'merge') {
      const paths = normalizeHtmlPathsArg(htmlPaths);
      if (!paths || paths.length === 0) {
        throw new Error(
          'report-tool: --htmlPaths is required for action "merge". Provide a JSON array or comma-separated list of report paths.',
        );
      }

      const overwriteFlag =
        overwrite === true || overwrite === 'true' || overwrite === '1';

      const result = mergeReportFiles({
        htmlPaths: paths,
        outputDir,
        outputName,
        overwrite: overwriteFlag,
      });

      return {
        isError: false,
        content: [
          {
            type: 'text',
            text: `Merged ${paths.length} report(s) into ${result.mergedReportPath}`,
          },
        ],
      };
    }

    if (!htmlPath) {
      throw new Error('report-tool: --htmlPath is required');
    }

    if (!outputDir) {
      throw new Error('report-tool: --outputDir is required');
    }

    if (action === 'to-markdown') {
      const result = await reportFileToMarkdown({
        htmlPath,
        outputDir,
      });
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

    const result = splitReportFile({
      htmlPath,
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
