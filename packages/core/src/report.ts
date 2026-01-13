import * as fs from 'node:fs';
import * as path from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { getReportFileName } from './agent';
import type { ReportFileWithAttributes } from './types';
import { getReportTpl, insertScriptBeforeClosingHtml } from './utils';

export class ReportMergingTool {
  private reportInfos: ReportFileWithAttributes[] = [];
  public append(reportInfo: ReportFileWithAttributes) {
    this.reportInfos.push(reportInfo);
  }
  public clear() {
    this.reportInfos = [];
  }

  /**
   * Extract all script content from a report file.
   * Includes both image scripts (midscene-image) and dump scripts (midscene_web_dump).
   */
  private extractAllScripts(filePath: string): string {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const scripts: string[] = [];

    // Extract image script tags: <script type="midscene-image" data-id="...">...</script>
    const imageRegex = /<script type="midscene-image"[^>]*>[\s\S]*?<\/script>/g;
    const imageMatches = fileContent.match(imageRegex);
    if (imageMatches) {
      scripts.push(...imageMatches);
    }

    // Extract dump script tags (with attributes): <script type="midscene_web_dump" ...>...</script>
    const dumpRegex =
      /<script type="midscene_web_dump"[^>]*>[\s\S]*?<\/script>/g;
    const dumpMatches = fileContent.match(dumpRegex);
    if (dumpMatches) {
      scripts.push(...dumpMatches);
    }

    return scripts.join('\n');
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
      // Write template - check if valid, use minimal HTML if not
      const tpl = getReportTpl();
      const isValidTemplate = tpl.includes('</html>');
      if (isValidTemplate) {
        fs.writeFileSync(outputFilePath, tpl);
      } else {
        // Use minimal HTML wrapper if template is placeholder (e.g., test env)
        fs.writeFileSync(
          outputFilePath,
          '<!DOCTYPE html><html><head></head><body></body></html>',
        );
      }

      // Process all reports one by one
      for (let i = 0; i < this.reportInfos.length; i++) {
        const reportInfo = this.reportInfos[i];
        console.log(`Processing report ${i + 1}/${this.reportInfos.length}`);

        // Extract all scripts (images + dump) from the original report
        const allScripts = this.extractAllScripts(reportInfo.reportFilePath);

        // Insert all scripts before </html>
        if (allScripts) {
          insertScriptBeforeClosingHtml(outputFilePath, allScripts);
        }
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
