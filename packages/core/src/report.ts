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
  private extractScriptContent(filePath: string): string {
    // Regular expression to match content between script tags
    // Use global flag to find ALL matches, then return the LAST one
    // (the report template may contain similar regex patterns in bundled JS)
    const scriptRegex =
      /<script type="midscene_web_dump"[^>]*>([\s\S]*?)<\/script>/g;

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const matches = [...fileContent.matchAll(scriptRegex)];
    const lastMatch = matches.length > 0 ? matches[matches.length - 1] : null;

    return lastMatch ? lastMatch[1].trim() : '';
  }

  /**
   * Extract all image script tags from HTML file using streaming.
   * Avoids loading entire large HTML files into memory.
   */
  private extractImageScripts(filePath: string): string {
    const openTag = '<script type="midscene-image"';
    const closeTag = '</script>';

    try {
      const fd = fs.openSync(filePath, 'r');
      const fileSize = fs.statSync(filePath).size;
      const buffer = Buffer.alloc(CHUNK_SIZE);

      let position = 0;
      let leftover = '';
      let capturing = false;
      let currentTag = '';
      const results: string[] = [];

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
                results.push(currentTag.slice(0, endIdx + closeTag.length));
                capturing = false;
                currentTag = '';
                searchStart = startIdx + endIdx + closeTag.length;
              } else {
                // Tag spans chunks, keep partial and continue
                leftover = currentTag.slice(-closeTag.length);
                currentTag = currentTag.slice(0, -closeTag.length);
                break;
              }
            } else {
              // No more tags in this chunk
              leftover = chunk.slice(-openTag.length);
              break;
            }
          } else {
            const endIdx = chunk.indexOf(closeTag, searchStart);
            if (endIdx !== -1) {
              currentTag += chunk.slice(searchStart, endIdx + closeTag.length);
              results.push(currentTag);
              capturing = false;
              currentTag = '';
              searchStart = endIdx + closeTag.length;
            } else {
              // Tag continues to next chunk
              currentTag += chunk.slice(searchStart, -closeTag.length);
              leftover = chunk.slice(-closeTag.length);
              break;
            }
          }
        }
      }

      fs.closeSync(fd);
      return results.join('\n');
    } catch {
      // File may not exist or be readable, return empty string
      return '';
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

        // Extract and append image scripts (for inline mode reports)
        const imageScripts = this.extractImageScripts(
          reportInfo.reportFilePath,
        );
        if (imageScripts) {
          fs.appendFileSync(outputFilePath, `${imageScripts}\n`);
        }

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
