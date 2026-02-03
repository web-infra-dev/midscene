import { appendFileSync, existsSync, unlinkSync } from 'node:fs';
import * as path from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { logMsg } from '@midscene/shared/utils';
import { getReportFileName } from './agent';
import {
  extractLastDumpScriptSync,
  streamImageScriptsToFile,
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

    const outputFilePath =
      reportFileName === 'AUTO'
        ? path.resolve(targetDir, `${getReportFileName('merged-report')}.html`)
        : path.resolve(targetDir, `${reportFileName}.html`);

    if (reportFileName !== 'AUTO' && existsSync(outputFilePath)) {
      if (!overwrite) {
        throw new Error(
          `Report file already exists: ${outputFilePath}\nSet overwrite to true to overwrite this file.`,
        );
      }
      unlinkSync(outputFilePath);
    }

    logMsg(
      `Start merging ${this.reportInfos.length} reports...\nCreating template file...`,
    );

    try {
      // Write template
      appendFileSync(outputFilePath, getReportTpl());

      // Process all reports one by one
      for (let i = 0; i < this.reportInfos.length; i++) {
        const reportInfo = this.reportInfos[i];
        logMsg(`Processing report ${i + 1}/${this.reportInfos.length}`);

        // Stream image scripts directly to output file (constant memory per image)
        streamImageScriptsToFile(reportInfo.reportFilePath, outputFilePath);

        const dumpString = extractLastDumpScriptSync(reportInfo.reportFilePath);
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

        appendFileSync(outputFilePath, reportHtmlStr);
      }

      logMsg(`Successfully merged new report: ${outputFilePath}`);

      // Remove original reports if needed
      if (rmOriginalReports) {
        for (const info of this.reportInfos) {
          try {
            unlinkSync(info.reportFilePath);
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
