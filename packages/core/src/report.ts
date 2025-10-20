import * as fs from 'node:fs';
import * as path from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { getReportFileName } from './agent';
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
  private extractScriptContent(filePath: string): string {
    // Regular expression to match content between script tags
    // Requires newline before <script and </script>
    const scriptRegex =
      /\n<script type="midscene_web_dump" type="application\/json"[^>]*>([\s\S]*?)\n<\/script>/;

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const match = scriptRegex.exec(fileContent);

    return match ? match[1].trim() : '';
  }

  public mergeReports(
    reportFileName: 'AUTO' | string = 'AUTO', // user custom report filename, save into midscene report dir if undefined
    opts?: {
      rmOriginalReports?: boolean; // whether to remove origin report files
      overwrite?: boolean; // if output filepath specified, throw an error when overwrite = true, otherwise overwrite the file
    },
  ): string | null {
    if (this.reportInfos.length <= 1) {
      console.log('Not enough report to merge');
      return null;
    }
    opts = Object.assign(
      {
        rmOriginalReports: false,
        overwrite: false,
      },
      opts || {},
    );
    const { rmOriginalReports, overwrite } = opts;
    let outputFilePath;
    const targetDir = `${getMidsceneRunSubDir('report')}`;
    if (reportFileName === 'AUTO') {
      outputFilePath = path.resolve(
        targetDir,
        `${getReportFileName('merged-report')}.html`,
      );
    } else {
      // user specified a output filepath
      outputFilePath = path.resolve(targetDir, `${reportFileName}.html`);
      if (fs.existsSync(outputFilePath) && !overwrite) {
        throw Error(
          `report file already existed: ${outputFilePath}\nset override to true to overwrite this file.`,
        );
      } else if (fs.existsSync(outputFilePath) && overwrite) {
        fs.unlinkSync(outputFilePath);
      }
    }

    console.log(
      `Start merging ${this.reportInfos.length} reports...\nCreating template file...`,
    );

    try {
      // Write template
      fs.appendFileSync(outputFilePath, getReportTpl());

      // Process all reports one by one
      for (let i = 0; i < this.reportInfos.length; i++) {
        const reportInfo = this.reportInfos[i];
        console.log(`Processing report ${i + 1}/${this.reportInfos.length}`);

        const dumpString = this.extractScriptContent(reportInfo.reportFilePath);
        const reportAttributes = reportInfo.reportAttributes;

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
        )}\n`; // use existed function to achieve report script content

        fs.appendFileSync(outputFilePath, reportHtmlStr);
      }

      console.log(`Successfully merged new report: ${outputFilePath}`);

      // Remove original reports if needed
      if (rmOriginalReports) {
        for (const info of this.reportInfos) {
          try {
            fs.unlinkSync(info.reportFilePath);
          } catch (error) {
            console.error(
              `Error deleting report ${info.reportFilePath}:`,
              error,
            );
          }
        }
        console.log(`Removed ${this.reportInfos.length} original reports`);
      }
      return outputFilePath;
    } catch (error) {
      console.error('Error in mergeReports:', error);
      throw error;
    }
  }
}
