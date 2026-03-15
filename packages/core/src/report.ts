import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import * as path from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { logMsg } from '@midscene/shared/utils';
import { getReportFileName } from './agent';
import {
  extractLastDumpScriptSync,
  getBaseUrlFixScript,
  streamInlineReportArtifactsSync,
} from './dump/html-utils';
import type { ReportFileWithAttributes } from './types';
import { getReportTpl, reportHTMLContent } from './utils';

export class ReportMergingTool {
  private reportInfos: ReportFileWithAttributes[] = [];
  public append(reportInfo: ReportFileWithAttributes) {
    this.reportInfos.push(reportInfo);
  }
  public clear() {
    this.reportInfos = [];
  }

  /**
   * Check if a report is in directory mode (html-and-external-assets).
   * Directory mode reports: {name}/index.html + {name}/screenshots/
   */
  private isDirectoryModeReport(reportFilePath: string): boolean {
    const reportDir = path.dirname(reportFilePath);
    return (
      path.basename(reportFilePath) === 'index.html' &&
      existsSync(path.join(reportDir, 'screenshots'))
    );
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
      this.isDirectoryModeReport(info.reportFilePath),
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

    logMsg(
      `Start merging ${this.reportInfos.length} reports...\nCreating template file...`,
    );

    let outputFd: number | null = null;

    try {
      mkdirSync(path.dirname(outputFilePath), { recursive: true });
      outputFd = openSync(outputFilePath, 'w');

      // Write template
      writeSync(outputFd, getReportTpl());

      // For directory-mode output, inject base URL fix script
      if (hasDirectoryModeReport) {
        writeSync(outputFd, getBaseUrlFixScript());
      }

      // Process all reports one by one
      for (let i = 0; i < this.reportInfos.length; i++) {
        const reportInfo = this.reportInfos[i];
        logMsg(`Processing report ${i + 1}/${this.reportInfos.length}`);

        let dumpString = '';
        if (this.isDirectoryModeReport(reportInfo.reportFilePath)) {
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
          dumpString = extractLastDumpScriptSync(reportInfo.reportFilePath);
        } else {
          // Inline mode: copy image scripts and extract dump in a single scan
          dumpString = streamInlineReportArtifactsSync(
            reportInfo.reportFilePath,
            (imageScriptTag) => {
              writeSync(outputFd!, imageScriptTag);
            },
          );
        }

        const { reportAttributes } = reportInfo;

        const reportHtmlStr = `${reportHTMLContent(
          {
            dumpString,
            attributes: {
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

        writeSync(outputFd!, reportHtmlStr);
      }

      logMsg(`Successfully merged new report: ${outputFilePath}`);

      // Remove original reports if needed
      if (rmOriginalReports) {
        for (const info of this.reportInfos) {
          try {
            if (this.isDirectoryModeReport(info.reportFilePath)) {
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
    } finally {
      if (outputFd !== null) {
        closeSync(outputFd);
      }
    }
  }
}
