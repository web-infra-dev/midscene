import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import * as path from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { logMsg } from '@midscene/shared/utils';
import { getReportFileName } from './agent';
import {
  extractAllDumpScriptsSync,
  generateDumpScriptTag,
  getBaseUrlFixScript,
  streamImageScriptsToFile,
} from './dump/html-utils';
import type { ReportFileWithAttributes } from './types';
import { getReportTpl } from './utils';

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
        } else {
          // Inline mode: stream image scripts to output file
          streamImageScriptsToFile(reportInfo.reportFilePath, outputFilePath);
        }

        const { reportAttributes } = reportInfo;
        const mergeAttributes: Record<string, string> = {
          playwright_test_duration: String(reportAttributes.testDuration),
          playwright_test_status: reportAttributes.testStatus,
          playwright_test_title: reportAttributes.testTitle,
          playwright_test_id: reportAttributes.testId,
          playwright_test_description: reportAttributes.testDescription,
        };

        // Extract ALL dump tags from the source report (supports per-execution format)
        // Filter out template artifacts: the report template's bundled JS may
        // contain the literal '<script type="midscene_web_dump"' pattern,
        // producing false matches with very large JS code as "content".
        // Real dump content is either empty, a short string, or JSON starting with '{'.
        // Template artifacts are large (>100KB) fragments of bundled JS code.
        const dumpEntries = extractAllDumpScriptsSync(
          reportInfo.reportFilePath,
        ).filter((entry) => {
          if (entry.content.length === 0) return false;
          // Template JS artifact is typically very large (100KB+); real dumps are smaller
          // and start with valid characters (JSON or escaped content)
          if (entry.content.length > 100_000) {
            // Could be a very large dump, but check if it starts with JS patterns
            const trimmed = entry.content.trimStart();
            if (
              trimmed.startsWith('\\') ||
              trimmed.startsWith("'") ||
              trimmed.startsWith('+')
            ) {
              return false; // This is bundled JS code, not dump content
            }
          }
          return true;
        });
        for (const entry of dumpEntries) {
          // Merge source attributes with report attributes
          const combinedAttributes = {
            ...entry.attributes,
            ...mergeAttributes,
          };
          const dumpTag = generateDumpScriptTag(
            entry.content,
            combinedAttributes,
          );
          appendFileSync(outputFilePath, `${dumpTag}\n`);
        }
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
    }
  }
}
