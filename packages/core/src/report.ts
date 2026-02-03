import { appendFileSync } from 'node:fs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { logMsg } from '@midscene/shared/utils';
import { getReportFileName } from './agent';
import { streamScanTags } from './dump/html-utils';
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
   * Extract dump script content using streaming.
   * Searches for the LAST <script type="midscene_web_dump"> tag.
   * Memory usage: O(dump_size), not O(file_size).
   */
  private extractScriptContent(filePath: string): string {
    // Note: We need to find the LAST match, and the tag has attributes after the type
    // So we use a specialized pattern: find all matches, keep the last one
    const openTagPrefix = '<script type="midscene_web_dump"';
    const closeTag = '</script>';

    let lastContent = '';

    // Custom streaming to handle the special case where open tag has variable attributes
    const fd = fs.openSync(filePath, 'r');
    const fileSize = fs.statSync(filePath).size;
    const chunkSize = 64 * 1024;
    const buffer = Buffer.alloc(chunkSize);

    let position = 0;
    let leftover = '';
    let capturing = false;
    let currentContent = '';

    try {
      while (position < fileSize) {
        const bytesRead = fs.readSync(fd, buffer, 0, chunkSize, position);
        const chunk = leftover + buffer.toString('utf-8', 0, bytesRead);
        position += bytesRead;

        let searchStart = 0;

        while (searchStart < chunk.length) {
          if (!capturing) {
            const startIdx = chunk.indexOf(openTagPrefix, searchStart);
            if (startIdx !== -1) {
              // Find the end of the opening tag (the '>' character)
              const tagEndIdx = chunk.indexOf('>', startIdx);
              if (tagEndIdx !== -1) {
                capturing = true;
                currentContent = chunk.slice(tagEndIdx + 1);
                const endIdx = currentContent.indexOf(closeTag);
                if (endIdx !== -1) {
                  lastContent = currentContent.slice(0, endIdx).trim();
                  capturing = false;
                  currentContent = '';
                  searchStart = tagEndIdx + 1 + endIdx + closeTag.length;
                } else {
                  leftover = currentContent.slice(-closeTag.length);
                  currentContent = currentContent.slice(0, -closeTag.length);
                  break;
                }
              } else {
                leftover = chunk.slice(startIdx);
                break;
              }
            } else {
              leftover = chunk.slice(-openTagPrefix.length);
              break;
            }
          } else {
            const endIdx = chunk.indexOf(closeTag, searchStart);
            if (endIdx !== -1) {
              currentContent += chunk.slice(searchStart, endIdx);
              lastContent = currentContent.trim();
              capturing = false;
              currentContent = '';
              searchStart = endIdx + closeTag.length;
            } else {
              currentContent += chunk.slice(searchStart, -closeTag.length);
              leftover = chunk.slice(-closeTag.length);
              break;
            }
          }
        }
      }
    } finally {
      fs.closeSync(fd);
    }

    return lastContent;
  }

  /**
   * Stream image script tags from source file directly to output file.
   * Memory usage: O(single_image_size), not O(all_images_size).
   */
  private streamImageScriptsToFile(
    srcFilePath: string,
    destFilePath: string,
  ): void {
    const openTag = '<script type="midscene-image"';
    const closeTag = '</script>';

    streamScanTags(srcFilePath, openTag, closeTag, (content) => {
      // Write complete tag immediately to destination, don't accumulate
      appendFileSync(destFilePath, `${openTag}${content}${closeTag}\n`);
      return false; // Continue scanning for more tags
    });
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

    if (reportFileName !== 'AUTO' && fs.existsSync(outputFilePath)) {
      if (!overwrite) {
        throw new Error(
          `Report file already exists: ${outputFilePath}\nSet overwrite to true to overwrite this file.`,
        );
      }
      fs.unlinkSync(outputFilePath);
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
        this.streamImageScriptsToFile(
          reportInfo.reportFilePath,
          outputFilePath,
        );

        const dumpString = this.extractScriptContent(reportInfo.reportFilePath);
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
            fs.unlinkSync(info.reportFilePath);
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
