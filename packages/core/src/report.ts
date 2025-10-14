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
  private extractLastScriptContentFromEnd(filePath: string): string {
    const INITIAL_CHUNK_SIZE = 1024 * 1024; // Initial chunk size 1MB (adjustable based on content)
    const fd = fs.openSync(filePath, 'r');
    const fileSize = fs.statSync(filePath).size;
    let position = fileSize;
    const buffer = Buffer.alloc(INITIAL_CHUNK_SIZE);
    let lastScriptContent: string | null = null;
    let isInsideScript = false; // Flag indicating whether <script> start tag has been found
    let accumulatedContent = ''; // Content accumulated after finding <script>
    let lastChunkTail = ''; // Keep last few chars to detect tags spanning chunks

    while (position > 0 && lastScriptContent === null) {
      position = Math.max(0, position - INITIAL_CHUNK_SIZE);

      const bytesRead = fs.readSync(
        fd,
        buffer,
        0,
        Math.min(INITIAL_CHUNK_SIZE, fileSize - position),
        position,
      );
      const chunk = buffer.toString('utf-8', 0, bytesRead);

      // If <script> hasn't been found yet, continue searching backwards
      if (!isInsideScript) {
        // Check in current chunk + overlap from previous chunk
        const searchContent = chunk + lastChunkTail;
        const scriptStartIdx = searchContent.lastIndexOf('<script');
        if (scriptStartIdx !== -1) {
          isInsideScript = true;
          // Start accumulating from <script> tag
          accumulatedContent = searchContent.slice(scriptStartIdx);
        } else {
          // Keep last 20 chars to detect tags that span chunks
          lastChunkTail = chunk.slice(-20) + lastChunkTail.slice(0, 20);
        }
      } else {
        // Already found <script>, keep accumulating
        accumulatedContent = chunk + accumulatedContent;

        // Check if we now have </script>
        const scriptEndIdx = accumulatedContent.indexOf('</script>');
        if (scriptEndIdx !== -1) {
          // Extract complete content (from <script> to </script>)
          const fullScriptTag = accumulatedContent.slice(
            0,
            scriptEndIdx + '</script>'.length,
          );
          const contentStartIdx = fullScriptTag.indexOf('>') + 1;
          lastScriptContent = fullScriptTag
            .slice(contentStartIdx, scriptEndIdx)
            .trim();
          break;
        }
      }
    }

    fs.closeSync(fd);
    return lastScriptContent ?? '';
  }

  public mergeReports(
    reportFileName: 'AUTO' | string = 'AUTO', // user custom report filename, save into midscene report dir if undefined
    opts?: {
      rmOriginalReports?: boolean; // whether to remove origin report files
      overwrite?: boolean; // if outfilepath specified, throw an error when overwrite = true, otherwise overwrite the file
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
      // user specified a outfilepath
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

        const dumpString = this.extractLastScriptContentFromEnd(
          reportInfo.reportFilePath,
        );
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
