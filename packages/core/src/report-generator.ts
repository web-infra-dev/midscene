import {
  existsSync,
  mkdirSync,
  statSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { getDebug } from '@midscene/shared/logger';
import { logMsg } from '@midscene/shared/utils';
import {
  generateDumpScriptTag,
  generateImageScriptTag,
} from './dump/html-utils';
import type { GroupedActionDump } from './types';
import { appendFileSync, getReportTpl } from './utils';

const debug = getDebug('report-generator');

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

function stripBase64Prefix(base64: string): string {
  return base64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
}

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
      useDirectoryReport?: boolean;
      autoPrintReportMsg?: boolean;
      reportGenerator?: IReportGenerator;
    },
  ): IReportGenerator {
    if (opts.reportGenerator) return opts.reportGenerator;
    if (opts.generateReport === false) return nullReportGenerator;

    if (opts.useDirectoryReport) {
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
    this.writeQueue = this.writeQueue
      .then(() => {
        if (this.destroyed) return;
        this.doWrite(dump);
      })
      .catch((error) => {
        debug('Error writing report:', error);
        console.error('Error writing report:', error);
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

    // 2. append new image tags and release memory
    const screenshots = dump.collectAllScreenshots();
    for (const screenshot of screenshots) {
      if (!this.writtenScreenshots.has(screenshot.id)) {
        appendFileSync(
          this.reportPath,
          `\n${generateImageScriptTag(screenshot.id, screenshot.base64)}`,
        );
        screenshot.markPersistedInline(); // release base64 memory
        this.writtenScreenshots.add(screenshot.id);
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

    // 1. write new screenshots as PNG files and release memory
    const screenshots = dump.collectAllScreenshots();
    for (const screenshot of screenshots) {
      if (!this.writtenScreenshots.has(screenshot.id)) {
        const buffer = Buffer.from(
          stripBase64Prefix(screenshot.base64),
          'base64',
        );
        const relativePath = `./screenshots/${screenshot.id}.png`;
        writeFileSync(join(screenshotsDir, `${screenshot.id}.png`), buffer);
        screenshot.markPersistedToPath(relativePath); // release base64 memory
        this.writtenScreenshots.add(screenshot.id);
      }
    }

    // 2. write HTML with dump JSON (toSerializable() returns correct format)
    const serialized = dump.serialize();
    writeFileSync(
      this.reportPath,
      `${getReportTpl()}\n${generateDumpScriptTag(serialized)}`,
    );
  }
}
