import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { antiEscapeScriptTag, logMsg } from '@midscene/shared/utils';
import { getReportFileName } from './agent';
import {
  extractAllDumpScriptsSync,
  extractImageByIdSync,
  extractLastDumpScriptSync,
  getBaseUrlFixScript,
  streamDumpScriptsSync,
  streamImageScriptsToFile,
} from './dump/html-utils';
import { normalizeScreenshotRef } from './dump/screenshot-store';
import { type IExecutionDump, ReportActionDump } from './types';
import type { ReportFileWithAttributes } from './types';
import { getReportTpl, reportHTMLContent } from './utils';

/**
 * Check if a report is in directory mode (html-and-external-assets).
 * Directory mode reports: {name}/index.html + {name}/screenshots/
 */
export function isDirectoryModeReport(reportFilePath: string): boolean {
  const reportDir = path.dirname(reportFilePath);
  return (
    path.basename(reportFilePath) === 'index.html' &&
    existsSync(path.join(reportDir, 'screenshots'))
  );
}

export class ReportMergingTool {
  private reportInfos: ReportFileWithAttributes[] = [];
  public append(reportInfo: ReportFileWithAttributes) {
    this.reportInfos.push(reportInfo);
  }
  public clear() {
    this.reportInfos = [];
  }

  /**
   * Merge multiple dump script contents (from the same source report)
   * into a single serialized ReportActionDump string.
   * If there's only one dump, return it as-is. If multiple, merge
   * all executions into the first dump's group structure.
   */
  private mergeDumpScripts(contents: string[]): string {
    const unescaped = contents
      .map((c) => antiEscapeScriptTag(c))
      .filter((c) => c.length > 0);
    if (unescaped.length === 0) return '';
    if (unescaped.length === 1) return unescaped[0];

    // Parse all dumps and collect executions, deduplicating by id (keep last).
    // Only executions with a stable id are deduped; old-format entries without
    // id are always kept (they may be distinct despite sharing the same name).
    const base = ReportActionDump.fromSerializedString(unescaped[0]);
    const allExecutions = [...base.executions];
    for (let i = 1; i < unescaped.length; i++) {
      const other = ReportActionDump.fromSerializedString(unescaped[i]);
      allExecutions.push(...other.executions);
    }
    let noIdCounter = 0;
    const deduped = new Map<string, (typeof allExecutions)[0]>();
    for (const exec of allExecutions) {
      const key = exec.id || `__no_id_${noIdCounter++}`;
      deduped.set(key, exec);
    }
    base.executions = Array.from(deduped.values());
    return base.serialize();
  }

  public mergeReports(
    reportFileName: 'AUTO' | string = 'AUTO',
    opts?: {
      rmOriginalReports?: boolean;
      overwrite?: boolean;
    },
  ): string | null {
    if (this.reportInfos.length <= 1) {
      logMsg('Not enough reports to merge');
      return null;
    }

    const { rmOriginalReports = false, overwrite = false } = opts ?? {};
    const targetDir = getMidsceneRunSubDir('report');

    // Check if any source report is directory mode
    const hasDirectoryModeReport = this.reportInfos.some((info) =>
      isDirectoryModeReport(info.reportFilePath),
    );

    const resolvedName =
      reportFileName === 'AUTO'
        ? getReportFileName('merged-report')
        : reportFileName;

    // Directory mode: output as {name}/index.html to keep relative paths working
    // Inline mode: output as {name}.html (single file)
    const outputFilePath = hasDirectoryModeReport
      ? path.resolve(targetDir, resolvedName, 'index.html')
      : path.resolve(targetDir, `${resolvedName}.html`);

    if (reportFileName !== 'AUTO' && existsSync(outputFilePath)) {
      if (!overwrite) {
        throw new Error(
          `Report file already exists: ${outputFilePath}\nSet overwrite to true to overwrite this file.`,
        );
      }
      if (hasDirectoryModeReport) {
        rmSync(path.dirname(outputFilePath), { recursive: true, force: true });
      } else {
        unlinkSync(outputFilePath);
      }
    }

    if (hasDirectoryModeReport) {
      mkdirSync(path.dirname(outputFilePath), { recursive: true });
    }

    logMsg(
      `Start merging ${this.reportInfos.length} reports...\nCreating template file...`,
    );

    try {
      // Write template
      appendFileSync(outputFilePath, getReportTpl());

      // For directory-mode output, inject base URL fix script
      if (hasDirectoryModeReport) {
        appendFileSync(outputFilePath, getBaseUrlFixScript());
      }

      // Process all reports one by one
      for (let i = 0; i < this.reportInfos.length; i++) {
        const reportInfo = this.reportInfos[i];
        logMsg(`Processing report ${i + 1}/${this.reportInfos.length}`);

        if (isDirectoryModeReport(reportInfo.reportFilePath)) {
          // Directory mode: copy external screenshot files
          const reportDir = path.dirname(reportInfo.reportFilePath);
          const screenshotsDir = path.join(reportDir, 'screenshots');
          const mergedScreenshotsDir = path.join(
            path.dirname(outputFilePath),
            'screenshots',
          );
          mkdirSync(mergedScreenshotsDir, { recursive: true });
          for (const file of readdirSync(screenshotsDir)) {
            const src = path.join(screenshotsDir, file);
            const dest = path.join(mergedScreenshotsDir, file);
            copyFileSync(src, dest);
          }
        } else {
          // Inline mode: stream image scripts to output file
          streamImageScriptsToFile(reportInfo.reportFilePath, outputFilePath);
        }

        // Extract all dump scripts from the source report.
        // After the per-execution append refactor, a single source report
        // may contain multiple <script type="midscene_web_dump"> tags
        // (one per execution). We merge them into a single ReportActionDump.
        // Filter by data-group-id to exclude false matches from the template's
        // bundled JS code, which also references the midscene_web_dump type string.
        const allDumps = extractAllDumpScriptsSync(
          reportInfo.reportFilePath,
        ).filter((d) => d.openTag.includes('data-group-id'));
        const groupIdMatch = allDumps[0]?.openTag.match(
          /data-group-id="([^"]+)"/,
        );
        const mergedGroupId = groupIdMatch
          ? decodeURIComponent(groupIdMatch[1])
          : `merged-group-${i}`;
        const dumpString =
          allDumps.length > 0
            ? this.mergeDumpScripts(allDumps.map((d) => d.content))
            : extractLastDumpScriptSync(reportInfo.reportFilePath);
        const { reportAttributes } = reportInfo;

        const reportHtmlStr = `${reportHTMLContent(
          {
            dumpString,
            attributes: {
              'data-group-id': mergedGroupId,
              playwright_test_duration: reportAttributes.testDuration,
              playwright_test_status: reportAttributes.testStatus,
              playwright_test_title: reportAttributes.testTitle,
              playwright_test_id: reportAttributes.testId,
              playwright_test_description: reportAttributes.testDescription,
            },
          },
          undefined,
          undefined,
          false,
        )}\n`;

        appendFileSync(outputFilePath, reportHtmlStr);
      }

      logMsg(`Successfully merged new report: ${outputFilePath}`);

      // Remove original reports if needed
      if (rmOriginalReports) {
        for (const info of this.reportInfos) {
          try {
            if (isDirectoryModeReport(info.reportFilePath)) {
              // Directory mode: remove the entire report directory
              const reportDir = path.dirname(info.reportFilePath);
              rmSync(reportDir, { recursive: true, force: true });
            } else {
              unlinkSync(info.reportFilePath);
            }
          } catch (error) {
            logMsg(`Error deleting report ${info.reportFilePath}: ${error}`);
          }
        }
        logMsg(`Removed ${this.reportInfos.length} original reports`);
      }
      return outputFilePath;
    } catch (error) {
      logMsg(`Error in mergeReports: ${error}`);
      throw error;
    }
  }
}

export interface SplitReportHtmlOptions {
  htmlPath: string;
  outputDir: string;
}

export interface SplitReportHtmlResult {
  executionJsonFiles: string[];
  screenshotFiles: string[];
}

function extensionByMimeType(mimeType: string): 'png' | 'jpeg' {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpeg';
  throw new Error(`Unsupported screenshot mime type: ${mimeType}`);
}

function externalizeScreenshotsInExecution(
  execution: IExecutionDump,
  opts: {
    htmlPath: string;
    sourceDir: string;
    screenshotsDir: string;
    writtenFiles: Set<string>;
  },
): void {
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (typeof node !== 'object' || node === null) return;

    const ref = normalizeScreenshotRef(node);
    if (ref) {
      const ext = extensionByMimeType(ref.mimeType);
      const fileName = `${ref.id}.${ext}`;
      const relativePath = `./screenshots/${fileName}`;
      const absolutePath = path.join(opts.screenshotsDir, fileName);

      if (!opts.writtenFiles.has(fileName)) {
        if (ref.storage === 'inline') {
          const base64 = extractImageByIdSync(opts.htmlPath, ref.id);
          if (!base64) {
            throw new Error(
              `Inline screenshot "${ref.id}" not found in ${opts.htmlPath}`,
            );
          }
          const rawBase64 = base64.replace(
            /^data:image\/[a-zA-Z+]+;base64,/,
            '',
          );
          writeFileSync(absolutePath, Buffer.from(rawBase64, 'base64'));
        } else {
          if (!ref.path) {
            throw new Error(
              `File screenshot ref "${ref.id}" missing path in execution dump`,
            );
          }
          const sourceFile = path.join(opts.sourceDir, ref.path);
          if (!existsSync(sourceFile)) {
            throw new Error(
              `Screenshot file "${sourceFile}" not found for ref "${ref.id}"`,
            );
          }
          copyFileSync(sourceFile, absolutePath);
        }
        opts.writtenFiles.add(fileName);
      }

      ref.storage = 'file';
      ref.path = relativePath;
      return;
    }

    for (const value of Object.values(node)) {
      visit(value);
    }
  };

  visit(execution);
}

/**
 * Reverse parse a Midscene report HTML into per-execution JSON files and
 * externalized screenshots.
 */
export function splitReportHtmlByExecution(
  options: SplitReportHtmlOptions,
): SplitReportHtmlResult {
  const { htmlPath, outputDir } = options;
  const sourceDir = path.dirname(htmlPath);
  const screenshotsDir = path.join(outputDir, 'screenshots');

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(screenshotsDir, { recursive: true });

  const executionJsonFiles: string[] = [];
  const writtenScreenshotFiles = new Set<string>();
  let hasDumpScript = false;

  let fileIndex = 0;
  streamDumpScriptsSync(htmlPath, (dumpScript) => {
    if (!dumpScript.openTag.includes('data-group-id')) {
      return false;
    }
    hasDumpScript = true;
    const groupedDump = ReportActionDump.fromSerializedString(
      antiEscapeScriptTag(dumpScript.content),
    );
    for (const execution of groupedDump.executions) {
      fileIndex += 1;
      externalizeScreenshotsInExecution(execution, {
        htmlPath,
        sourceDir,
        screenshotsDir,
        writtenFiles: writtenScreenshotFiles,
      });
      const singleExecutionDump = new ReportActionDump({
        sdkVersion: groupedDump.sdkVersion,
        groupName: groupedDump.groupName,
        groupDescription: groupedDump.groupDescription,
        modelBriefs: groupedDump.modelBriefs,
        deviceType: groupedDump.deviceType,
        executions: [execution],
      });

      const jsonFilePath = path.join(outputDir, `${fileIndex}.execution.json`);
      writeFileSync(jsonFilePath, singleExecutionDump.serialize(2), 'utf-8');
      executionJsonFiles.push(jsonFilePath);
    }
    return false;
  });

  if (!hasDumpScript) {
    throw new Error(`No report dump scripts found in ${htmlPath}`);
  }

  return {
    executionJsonFiles,
    screenshotFiles: Array.from(writtenScreenshotFiles)
      .sort()
      .map((fileName) => path.join(screenshotsDir, fileName)),
  };
}
