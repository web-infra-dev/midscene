import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ReportDumpWithAttributes } from '@midscene/core';
import { getReportFileName, printReportMsg } from '@midscene/core/agent';
import { writeDumpReport } from '@midscene/core/utils';
import { replaceIllegalPathCharsAndSpace } from '@midscene/shared/utils';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
  TestResult,
} from '@playwright/test/reporter';

interface MidsceneReporterOptions {
  type?: 'merged' | 'separate';
}

class MidsceneReporter implements Reporter {
  private mergedFilename?: string;
  private testTitleToFilename = new Map<string, string>();
  mode?: 'merged' | 'separate';

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

  private updateReport(testData: ReportDumpWithAttributes) {
    if (!testData || !this.mode) return;
    const fileName = this.getReportFilename(
      testData.attributes?.playwright_test_title,
    );
    const reportPath = writeDumpReport(
      fileName,
      testData,
      this.mode === 'merged',
    );
    reportPath && printReportMsg(reportPath);
  }

  async onBegin(config: FullConfig, suite: Suite) {}

  onTestBegin(_test: TestCase, _result: TestResult) {
    // logger(`Starting test ${test.title}`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const dumpAnnotation = test.annotations.find((annotation) => {
      return annotation.type === 'MIDSCENE_DUMP_ANNOTATION';
    });
    if (!dumpAnnotation?.description) return;

    const tempFilePath = dumpAnnotation.description;
    let dumpString: string | undefined;

    try {
      dumpString = readFileSync(tempFilePath, 'utf-8');
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
      const testData: ReportDumpWithAttributes = {
        dumpString,
        attributes: {
          playwright_test_id: testId,
          playwright_test_title: `${test.title}${retry}`,
          playwright_test_status: result.status,
          playwright_test_duration: result.duration,
        },
      };

      this.updateReport(testData);
    }

    // Always clean up temp file, even if reading failed
    try {
      rmSync(tempFilePath, { force: true });
    } catch (error) {
      console.warn(
        `Failed to delete Midscene temp file: ${tempFilePath}`,
        error,
      );
    }
  }

  onError(error: TestError) {
    // Reporter-level errors might prevent onTestEnd from being called
    // Log the error but don't attempt cleanup here since we don't have
    // access to specific temp files. The onEnd hook will handle orphaned files.
    console.error('Midscene Reporter error occurred:', error);
  }

  onEnd(result: FullResult) {
    // Final cleanup: scan for any orphaned temp files that may have been
    // left behind by crashed workers or reporter errors
    try {
      const tmpDir = tmpdir();
      const files = readdirSync(tmpDir);
      const orphanedFiles = files.filter((f) => f.startsWith('midscene-dump-'));

      if (orphanedFiles.length > 0) {
        console.log(
          `Midscene: Found ${orphanedFiles.length} orphaned temp file(s), cleaning up...`,
        );

        for (const file of orphanedFiles) {
          const filePath = join(tmpDir, file);
          try {
            rmSync(filePath, { force: true });
            console.log(`Midscene: Cleaned up orphaned temp file: ${file}`);
          } catch (error) {
            // Silently ignore individual file cleanup errors
          }
        }
      }
    } catch (error) {
      // Silently ignore directory read errors
      console.warn('Midscene: Failed to scan for orphaned temp files:', error);
    }
  }
}

export default MidsceneReporter;
