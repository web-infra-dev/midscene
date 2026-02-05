import {
  existsSync,
  mkdirSync,
  statSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { ifInBrowser, logMsg } from '@midscene/shared/utils';
import {
  generateDumpScriptTag,
  generateImageScriptTag,
} from './dump/html-utils';
import type { GroupedActionDump } from './types';
import { appendFileSync, getReportTpl } from './utils';

export interface IReportGenerator {
  /**
   * Schedule a dump update. Writes are queued internally to guarantee serial execution.
   * This method returns immediately (fire-and-forget).
   * Screenshots are written and memory is released during this call.
   */
  onDumpUpdate(dump: GroupedActionDump): void;
  /**
   * Wait for all queued write operations to complete.
   */
  flush(): Promise<void>;
  /**
   * Finalize the report. Calls flush() internally before printing the final message.
   */
  finalize(dump: GroupedActionDump): Promise<string | undefined>;
  getReportPath(): string | undefined;
}

export const nullReportGenerator: IReportGenerator = {
  onDumpUpdate: () => {},
  flush: async () => {},
  finalize: async () => undefined,
  getReportPath: () => undefined,
};

export class ReportGenerator implements IReportGenerator {
  private reportPath: string;
  private screenshotMode: 'inline' | 'directory';
  private autoPrint: boolean;
  private writtenScreenshots = new Set<string>();

  // inline mode state
  private imageEndOffset = 0;
  private initialized = false;

  // write queue for serial execution
  private writeQueue: Promise<void> = Promise.resolve();
  private destroyed = false;

  constructor(options: {
    reportPath: string;
    screenshotMode: 'inline' | 'directory';
    autoPrint?: boolean;
  }) {
    this.reportPath = options.reportPath;
    this.screenshotMode = options.screenshotMode;
    this.autoPrint = options.autoPrint ?? true;
  }

  static create(
    reportFileName: string,
    opts: {
      generateReport?: boolean;
      outputFormat?: 'single-html' | 'html-and-external-assets';
      autoPrintReportMsg?: boolean;
    },
  ): IReportGenerator {
    if (opts.generateReport === false) return nullReportGenerator;

    // In browser environment, file system is not available
    if (ifInBrowser) return nullReportGenerator;

    if (opts.outputFormat === 'html-and-external-assets') {
      const outputDir = join(getMidsceneRunSubDir('report'), reportFileName);
      return new ReportGenerator({
        reportPath: join(outputDir, 'index.html'),
        screenshotMode: 'directory',
        autoPrint: opts.autoPrintReportMsg,
      });
    }

    return new ReportGenerator({
      reportPath: join(
        getMidsceneRunSubDir('report'),
        `${reportFileName}.html`,
      ),
      screenshotMode: 'inline',
      autoPrint: opts.autoPrintReportMsg,
    });
  }

  onDumpUpdate(dump: GroupedActionDump): void {
    this.writeQueue = this.writeQueue.then(() => {
      if (this.destroyed) return;
      this.doWrite(dump);
    });
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  async finalize(dump: GroupedActionDump): Promise<string | undefined> {
    this.onDumpUpdate(dump);
    await this.flush();
    this.destroyed = true;

    if (this.autoPrint && this.reportPath) {
      if (this.screenshotMode === 'directory') {
        console.log('\n[Midscene] Directory report generated.');
        console.log(
          '[Midscene] Note: This report must be served via HTTP server due to CORS restrictions.',
        );
        console.log(
          `[Midscene] Example: npx serve ${dirname(this.reportPath)}`,
        );
      } else {
        logMsg(`Midscene - report file updated: ${this.reportPath}`);
      }
    }

    return this.reportPath;
  }

  getReportPath(): string | undefined {
    return this.reportPath;
  }

  private doWrite(dump: GroupedActionDump): void {
    if (this.screenshotMode === 'inline') {
      this.writeInlineReport(dump);
    } else {
      this.writeDirectoryReport(dump);
    }
  }

  private writeInlineReport(dump: GroupedActionDump): void {
    const dir = dirname(this.reportPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (!this.initialized) {
      writeFileSync(this.reportPath, getReportTpl());
      this.imageEndOffset = statSync(this.reportPath).size;
      this.initialized = true;
    }

    // 1. truncate: remove old dump JSON, keep template + existing image tags
    truncateSync(this.reportPath, this.imageEndOffset);

    // 2. append new image tags and release memory immediately after writing
    // Screenshots can be recovered from HTML file via lazy loading
    const screenshots = dump.collectAllScreenshots();
    for (const screenshot of screenshots) {
      if (!this.writtenScreenshots.has(screenshot.id)) {
        appendFileSync(
          this.reportPath,
          `\n${generateImageScriptTag(screenshot.id, screenshot.base64)}`,
        );
        this.writtenScreenshots.add(screenshot.id);
        // Release memory - screenshot can be recovered via extractImageByIdSync
        screenshot.markPersistedInline(this.reportPath);
      }
    }

    // 3. update image end offset
    this.imageEndOffset = statSync(this.reportPath).size;

    // 4. append new dump JSON (compact { $screenshot: id } format)
    const serialized = dump.serialize();
    appendFileSync(this.reportPath, `\n${generateDumpScriptTag(serialized)}`);
  }

  private writeDirectoryReport(dump: GroupedActionDump): void {
    const dir = dirname(this.reportPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // create screenshots subdirectory
    const screenshotsDir = join(dir, 'screenshots');
    if (!existsSync(screenshotsDir)) {
      mkdirSync(screenshotsDir, { recursive: true });
    }

    // 1. write new screenshots as PNG files and release memory immediately
    // Screenshots can be recovered from PNG files via lazy loading
    const screenshots = dump.collectAllScreenshots();
    for (const screenshot of screenshots) {
      if (!this.writtenScreenshots.has(screenshot.id)) {
        const absolutePath = join(screenshotsDir, `${screenshot.id}.png`);
        const buffer = Buffer.from(screenshot.rawBase64, 'base64');
        writeFileSync(absolutePath, buffer);
        this.writtenScreenshots.add(screenshot.id);
        // Release memory - screenshot can be recovered from PNG file
        screenshot.markPersistedToPath(
          `./screenshots/${screenshot.id}.png`,
          absolutePath,
        );
      }
    }

    // 2. write HTML with dump JSON (toSerializable() returns { $screenshot: id } format)
    const serialized = dump.serialize();
    writeFileSync(
      this.reportPath,
      `${getReportTpl()}\n${generateDumpScriptTag(serialized)}`,
    );
  }
}
