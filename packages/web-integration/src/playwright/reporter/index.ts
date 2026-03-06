import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  GroupedActionDump,
  type ReportDumpWithAttributes,
} from '@midscene/core';
import { getReportFileName, printReportMsg } from '@midscene/core/agent';
import { getReportTpl } from '@midscene/core/utils';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import {
  escapeScriptTag,
  replaceIllegalPathCharsAndSpace,
} from '@midscene/shared/utils';
import type {
  FullConfig,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

interface MidsceneReporterOptions {
  type?: 'merged' | 'separate';
  /**
   * Output format for the report.
   * - 'single-html': All screenshots embedded as base64 in a single HTML file (default)
   * - 'html-and-external-assets': Screenshots saved as separate PNG files in a screenshots/ subdirectory
   *
   * Note: 'html-and-external-assets' reports must be served via HTTP server due to CORS restrictions.
   */
  outputFormat?: 'single-html' | 'html-and-external-assets';
}

class MidsceneReporter implements Reporter {
  private mergedFilename?: string;
  private testTitleToFilename = new Map<string, string>();
  mode?: 'merged' | 'separate';
  outputFormat: 'single-html' | 'html-and-external-assets';

  // Track all temp files created during this test run for cleanup
  private tempFiles = new Set<string>();

  // Track pending report updates
  private pendingReports = new Set<Promise<void>>();

  // Track whether the merged report file has been initialized
  private mergedReportInitialized = false;

  // Write queue to serialize file writes and prevent concurrent write conflicts
  private writeQueue: Promise<void> = Promise.resolve();

  // Track whether we have multiple projects (browsers)
  private hasMultipleProjects = false;

  // Track written screenshots to avoid duplicates (for directory mode)
  private writtenScreenshots = new Set<string>();

  constructor(options: MidsceneReporterOptions = {}) {
    // Set mode from constructor options (official Playwright way)
    this.mode = MidsceneReporter.getMode(options.type ?? 'merged');
    this.outputFormat = options.outputFormat ?? 'single-html';
  }

  private static getMode(reporterType: string): 'merged' | 'separate' {
    if (!reporterType) {
      return 'merged';
    }
    if (reporterType !== 'merged' && reporterType !== 'separate') {
      throw new Error(
        `Unknown reporter type in playwright config: ${reporterType}, only support 'merged' or 'separate'`,
      );
    }
    return reporterType;
  }

  private getSeparatedFilename(testTitle: string): string {
    if (!this.testTitleToFilename.has(testTitle)) {
      const baseTag = `playwright-${replaceIllegalPathCharsAndSpace(testTitle)}`;
      const generatedFilename = getReportFileName(baseTag);
      this.testTitleToFilename.set(testTitle, generatedFilename);
    }
    return this.testTitleToFilename.get(testTitle)!;
  }

  private getReportFilename(testTitle?: string): string {
    if (this.mode === 'merged') {
      if (!this.mergedFilename) {
        this.mergedFilename = getReportFileName('playwright-merged');
      }
      return this.mergedFilename;
    } else if (this.mode === 'separate') {
      if (!testTitle) throw new Error('testTitle is required in separate mode');
      return this.getSeparatedFilename(testTitle);
    }
    throw new Error(`Unknown mode: ${this.mode}`);
  }

  /**
   * Get the report path - for directory mode, returns a directory path with index.html
   */
  private getReportPath(testTitle?: string): string {
    const fileName = this.getReportFilename(testTitle);
    if (this.outputFormat === 'html-and-external-assets') {
      // Directory mode: report-name/index.html
      return join(getMidsceneRunSubDir('report'), fileName, 'index.html');
    }
    // Inline mode: report-name.html
    return join(getMidsceneRunSubDir('report'), `${fileName}.html`);
  }

  /**
   * Copy screenshots from temp location to report screenshots directory
   */
  private copyScreenshotsToReport(
    tempFilePath: string,
    reportPath: string,
  ): void {
    const screenshotsDir = join(dirname(reportPath), 'screenshots');
    const tempScreenshotsDir = `${tempFilePath}.screenshots`;

    if (!existsSync(tempScreenshotsDir)) {
      return;
    }

    // Ensure screenshots directory exists
    if (!existsSync(screenshotsDir)) {
      mkdirSync(screenshotsDir, { recursive: true });
    }

    // Read screenshot map to get all screenshot IDs
    const screenshotMapPath = `${tempFilePath}.screenshots.json`;
    if (!existsSync(screenshotMapPath)) {
      return;
    }

    try {
      const { readFileSync } = require('node:fs');
      const screenshotMap: Record<string, string> = JSON.parse(
        readFileSync(screenshotMapPath, 'utf-8'),
      );

      for (const [id, srcPath] of Object.entries(screenshotMap)) {
        // In merged mode, skip if already written to avoid duplicates
        // In separate mode, each test has its own screenshots directory
        if (this.mode === 'merged' && this.writtenScreenshots.has(id)) {
          continue;
        }

        const destPath = join(screenshotsDir, `${id}.png`);

        if (existsSync(srcPath)) {
          copyFileSync(srcPath, destPath);
          if (this.mode === 'merged') {
            this.writtenScreenshots.add(id);
          }
        }
      }
    } catch (error) {
      console.error('Error copying screenshots:', error);
    }
  }

  private async updateReport(testData: ReportDumpWithAttributes) {
    if (!testData || !this.mode) return;

    // Queue the write operation to prevent concurrent writes to the same file
    this.writeQueue = this.writeQueue.then(async () => {
      const reportPath = this.getReportPath(
        testData.attributes?.playwright_test_title,
      );

      // Ensure report directory exists for directory mode
      if (this.outputFormat === 'html-and-external-assets') {
        const reportDir = dirname(reportPath);
        if (!existsSync(reportDir)) {
          mkdirSync(reportDir, { recursive: true });
        }
      }

      // Get report template
      const tpl = getReportTpl();
      if (!tpl) {
        throw new Error(
          'Report template not found. Ensure @midscene/core is built correctly.',
        );
      }

      // Parse the dump string and generate dump script tag
      let dumpScript = `<script type="midscene_web_dump">\n${escapeScriptTag(testData.dumpString)}\n</script>`;

      // Add attributes to the dump script if this is merged report
      if (this.mode === 'merged' && testData.attributes) {
        const attributesArr = Object.keys(testData.attributes).map((key) => {
          return `${key}="${encodeURIComponent(testData.attributes![key])}"`;
        });
        // Add attributes to the script tag
        dumpScript = dumpScript.replace(
          '<script type="midscene_web_dump"',
          `<script type="midscene_web_dump" ${attributesArr.join(' ')}`,
        );
      }

      // Write or append to file
      if (this.mode === 'merged') {
        // For merged report, write template + dump on first write, then only append dumps
        if (!this.mergedReportInitialized) {
          writeFileSync(reportPath, tpl + dumpScript, { flag: 'w' });
          this.mergedReportInitialized = true;
        } else {
          // Append only the dump scripts for subsequent tests
          writeFileSync(reportPath, dumpScript, { flag: 'a' });
        }
      } else {
        // For separate reports, write each test to its own file with template
        writeFileSync(reportPath, tpl + dumpScript, { flag: 'w' });
      }

      printReportMsg(reportPath);
    });

    await this.writeQueue;
  }

  async onBegin(config: FullConfig, suite: Suite) {
    // Check if we have multiple projects to determine if we need browser labels
    this.hasMultipleProjects = (config.projects?.length || 0) > 1;
  }

  onTestBegin(_test: TestCase, _result: TestResult) {
    // logger(`Starting test ${test.title}`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const dumpAnnotation = test.annotations.find((annotation) => {
      return annotation.type === 'MIDSCENE_DUMP_ANNOTATION';
    });
    if (!dumpAnnotation?.description) return;

    const tempFilePath = dumpAnnotation.description;

    // Track temp files for potential cleanup in onEnd
    for (const filePath of GroupedActionDump.getFilePaths(tempFilePath)) {
      this.tempFiles.add(filePath);
    }

    let dumpString: string | undefined;

    try {
      if (this.outputFormat === 'html-and-external-assets') {
        // Directory mode: keep { $screenshot: id } format, copy screenshots to report dir
        const { readFileSync } = require('node:fs');
        dumpString = readFileSync(tempFilePath, 'utf-8');

        // Get report path and copy screenshots
        const retry = result.retry ? `(retry #${result.retry})` : '';
        const projectName = this.hasMultipleProjects
          ? test.parent?.project()?.name
          : undefined;
        const projectSuffix = projectName ? ` [${projectName}]` : '';
        const testTitle = `${test.title}${projectSuffix}${retry}`;
        const reportPath = this.getReportPath(testTitle);

        this.copyScreenshotsToReport(tempFilePath, reportPath);
      } else {
        // Inline mode: convert screenshots to base64
        dumpString = GroupedActionDump.fromFilesAsInlineJson(tempFilePath);
      }
    } catch (error) {
      console.error(
        `Failed to read Midscene dump file: ${tempFilePath}`,
        error,
      );
      // Don't return here - we still need to clean up the temp file
    }

    // Only update report if we successfully read the dump
    if (dumpString) {
      const retry = result.retry ? `(retry #${result.retry})` : '';
      const testId = `${test.id}${retry}`;

      // Get the project name (browser name) only if we have multiple projects
      const projectName = this.hasMultipleProjects
        ? test.parent?.project()?.name
        : undefined;
      const projectSuffix = projectName ? ` [${projectName}]` : '';

      const testData: ReportDumpWithAttributes = {
        dumpString,
        attributes: {
          playwright_test_id: testId,
          playwright_test_title: `${test.title}${projectSuffix}${retry}`,
          playwright_test_status: result.status,
          playwright_test_duration: result.duration,
        },
      };

      // Start async report update and track it
      const reportPromise = this.updateReport(testData)
        .catch((error) => {
          console.error('Error updating report:', error);
        })
        .finally(() => {
          this.pendingReports.delete(reportPromise);
        });
      this.pendingReports.add(reportPromise);
    }

    // Always try to clean up temp files
    try {
      GroupedActionDump.cleanupFiles(tempFilePath);
      for (const filePath of GroupedActionDump.getFilePaths(tempFilePath)) {
        this.tempFiles.delete(filePath);
      }
    } catch {
      // Keep in tempFiles for cleanup in onEnd
    }
  }

  async onEnd() {
    // Wait for all pending report updates to complete
    if (this.pendingReports.size > 0) {
      console.log(
        `Midscene: Waiting for ${this.pendingReports.size} pending report(s) to complete...`,
      );
      await Promise.all(Array.from(this.pendingReports));
    }

    // Print directory mode notice (only for merged mode)
    if (
      this.outputFormat === 'html-and-external-assets' &&
      this.mode === 'merged'
    ) {
      const reportPath = this.getReportPath();
      const reportDir = dirname(reportPath);
      console.log('[Midscene] Directory report generated.');
      console.log(
        '[Midscene] Note: This report must be served via HTTP server due to CORS restrictions.',
      );
      console.log(`[Midscene] Example: npx serve ${reportDir}`);
    } else if (
      this.outputFormat === 'html-and-external-assets' &&
      this.mode === 'separate'
    ) {
      const reportBaseDir = getMidsceneRunSubDir('report');
      console.log('[Midscene] Directory reports generated.');
      console.log(
        '[Midscene] Note: Reports must be served via HTTP server due to CORS restrictions.',
      );
      console.log(`[Midscene] Example: npx serve ${reportBaseDir}`);
    }

    // Clean up any remaining temp files that weren't deleted in onTestEnd
    if (this.tempFiles.size > 0) {
      console.log(
        `Midscene: Cleaning up ${this.tempFiles.size} remaining temp file(s)...`,
      );

      for (const filePath of this.tempFiles) {
        try {
          rmSync(filePath, { force: true });
        } catch (error) {
          // Silently ignore - file may have been deleted already
        }
      }

      this.tempFiles.clear();
    }
  }
}

export default MidsceneReporter;
