import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReportDumpWithAttributes } from '@midscene/core';
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
}

class MidsceneReporter implements Reporter {
  private mergedFilename?: string;
  private testTitleToFilename = new Map<string, string>();
  mode?: 'merged' | 'separate';

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

  constructor(options: MidsceneReporterOptions = {}) {
    // Set mode from constructor options (official Playwright way)
    this.mode = MidsceneReporter.getMode(options.type ?? 'merged');
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

  private async updateReport(testData: ReportDumpWithAttributes) {
    if (!testData || !this.mode) return;

    // Queue the write operation to prevent concurrent writes to the same file
    this.writeQueue = this.writeQueue.then(async () => {
      const fileName = this.getReportFilename(
        testData.attributes?.playwright_test_title,
      );

      const reportPath = join(
        getMidsceneRunSubDir('report'),
        `${fileName}.html`,
      );

      // Get report template
      const tpl = getReportTpl();
      if (!tpl) {
        throw new Error(
          'Report template not found. Ensure @midscene/core is built correctly.',
        );
      }

      // Parse the dump string (which already contains inline screenshots)
      // and generate dump script tag
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
    const screenshotsMapPath = `${tempFilePath}.screenshots.json`;
    const screenshotsDir = `${tempFilePath}.screenshots`;

    // Track these temp files for potential cleanup in onEnd
    this.tempFiles.add(tempFilePath);
    this.tempFiles.add(screenshotsMapPath);
    this.tempFiles.add(screenshotsDir);

    let dumpString: string | undefined;

    try {
      dumpString = readFileSync(tempFilePath, 'utf-8');

      // Read screenshot map and inline base64 data using JSON parsing (safer than regex)
      if (existsSync(screenshotsMapPath)) {
        const screenshotMap: Record<string, string> = JSON.parse(
          readFileSync(screenshotsMapPath, 'utf-8'),
        );

        // Parse JSON, replace screenshot references, re-serialize
        const dumpData = JSON.parse(dumpString);
        const replaceScreenshots = (obj: unknown): unknown => {
          if (obj === null || obj === undefined) return obj;
          if (Array.isArray(obj)) return obj.map(replaceScreenshots);
          if (typeof obj === 'object') {
            const record = obj as Record<string, unknown>;
            // Check if this is a screenshot reference: { $screenshot: id }
            if (
              '$screenshot' in record &&
              typeof record.$screenshot === 'string'
            ) {
              const id = record.$screenshot;
              const imagePath = screenshotMap[id];
              if (imagePath && existsSync(imagePath)) {
                const imageData = readFileSync(imagePath);
                return {
                  base64: `data:image/png;base64,${imageData.toString('base64')}`,
                };
              }
            }
            // Recursively process object properties
            const result: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(record)) {
              result[key] = replaceScreenshots(value);
            }
            return result;
          }
          return obj;
        };

        const processedData = replaceScreenshots(dumpData);
        dumpString = JSON.stringify(processedData);
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
    const filesToClean = [tempFilePath, screenshotsMapPath, screenshotsDir];
    for (const filePath of filesToClean) {
      try {
        rmSync(filePath, { force: true, recursive: true });
        this.tempFiles.delete(filePath);
      } catch (error) {
        // Keep in tempFiles for cleanup in onEnd
      }
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
