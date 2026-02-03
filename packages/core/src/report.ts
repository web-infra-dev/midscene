import * as fs from 'node:fs';
import * as path from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { getReportFileName } from './agent';
import type { ReportFileWithAttributes } from './types';
import { getReportTpl, reportHTMLContent } from './utils';

const CHUNK_SIZE = 64 * 1024; // 64KB chunks

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
    const openTag = '<script type="midscene_web_dump"';
    const closeTag = '</script>';

    const fd = fs.openSync(filePath, 'r');
    const fileSize = fs.statSync(filePath).size;
    const buffer = Buffer.alloc(CHUNK_SIZE);

    let position = 0;
    let leftover = '';
    let capturing = false;
    let currentContent = '';
    let lastContent = ''; // Keep only the last match

    try {
      while (position < fileSize) {
        const bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, position);
        const chunk = leftover + buffer.toString('utf-8', 0, bytesRead);
        position += bytesRead;

        let searchStart = 0;

        while (searchStart < chunk.length) {
          if (!capturing) {
            const startIdx = chunk.indexOf(openTag, searchStart);
            if (startIdx !== -1) {
              capturing = true;
              // Find the end of the opening tag (the '>' character)
              const tagEndIdx = chunk.indexOf('>', startIdx);
              if (tagEndIdx !== -1) {
                currentContent = chunk.slice(tagEndIdx + 1);
                const endIdx = currentContent.indexOf(closeTag);
                if (endIdx !== -1) {
                  lastContent = currentContent.slice(0, endIdx).trim();
                  capturing = false;
                  currentContent = '';
                  searchStart =
                    startIdx + tagEndIdx + 1 + endIdx + closeTag.length;
                } else {
                  leftover = currentContent.slice(-closeTag.length);
                  currentContent = currentContent.slice(0, -closeTag.length);
                  break;
                }
              } else {
                // Tag opening spans chunks
                leftover = chunk.slice(startIdx);
                break;
              }
            } else {
              leftover = chunk.slice(-openTag.length);
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

    const fd = fs.openSync(srcFilePath, 'r');
    const fileSize = fs.statSync(srcFilePath).size;
    const buffer = Buffer.alloc(CHUNK_SIZE);

    let position = 0;
    let leftover = '';
    let capturing = false;
    let currentTag = '';

    try {
      while (position < fileSize) {
        const bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, position);
        const chunk = leftover + buffer.toString('utf-8', 0, bytesRead);
        position += bytesRead;

        let searchStart = 0;

        while (searchStart < chunk.length) {
          if (!capturing) {
            const startIdx = chunk.indexOf(openTag, searchStart);
            if (startIdx !== -1) {
              capturing = true;
              currentTag = chunk.slice(startIdx);
              const endIdx = currentTag.indexOf(closeTag);
              if (endIdx !== -1) {
                // Write complete tag immediately, don't accumulate
                fs.appendFileSync(
                  destFilePath,
                  `${currentTag.slice(0, endIdx + closeTag.length)}\n`,
                );
                capturing = false;
                currentTag = '';
                searchStart = startIdx + endIdx + closeTag.length;
              } else {
                leftover = currentTag.slice(-closeTag.length);
                currentTag = currentTag.slice(0, -closeTag.length);
                break;
              }
            } else {
              leftover = chunk.slice(-openTag.length);
              break;
            }
          } else {
            const endIdx = chunk.indexOf(closeTag, searchStart);
            if (endIdx !== -1) {
              currentTag += chunk.slice(searchStart, endIdx + closeTag.length);
              // Write complete tag immediately
              fs.appendFileSync(destFilePath, `${currentTag}\n`);
              capturing = false;
              currentTag = '';
              searchStart = endIdx + closeTag.length;
            } else {
              currentTag += chunk.slice(searchStart, -closeTag.length);
              leftover = chunk.slice(-closeTag.length);
              break;
            }
          }
        }
      }
    } finally {
      fs.closeSync(fd);
    }
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

        // Stream image scripts directly to output file (constant memory per image)
        this.streamImageScriptsToFile(
          reportInfo.reportFilePath,
          outputFilePath,
        );

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
