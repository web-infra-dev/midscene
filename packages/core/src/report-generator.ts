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
   */
  onDumpUpdate(dump: GroupedActionDump, cachedSerializedDump?: string): void;
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

  onDumpUpdate(dump: GroupedActionDump, cachedSerializedDump?: string): void {
    this.writeQueue = this.writeQueue
      .then(() => {
        if (this.destroyed) return;
        this.doWrite(dump, cachedSerializedDump);
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

  private doWrite(
    dump: GroupedActionDump,
    cachedSerializedDump?: string,
  ): void {
    if (this.screenshotMode === 'inline') {
      this.writeInlineReport(dump, cachedSerializedDump);
    } else {
      this.writeDirectoryReport(dump, cachedSerializedDump);
    }
  }

  private writeInlineReport(
    dump: GroupedActionDump,
    cachedSerializedDump?: string,
  ): void {
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

    // 2. append new image tags
    const screenshots = dump.collectAllScreenshots();
    for (const screenshot of screenshots) {
      if (!this.writtenScreenshots.has(screenshot.id)) {
        appendFileSync(
          this.reportPath,
          `\n${generateImageScriptTag(screenshot.id, screenshot.base64)}`,
        );
        this.writtenScreenshots.add(screenshot.id);
      }
    }

    // 3. update image end offset
    this.imageEndOffset = statSync(this.reportPath).size;

    // 4. append new dump JSON (compact { $screenshot: id } format)
    const serialized = cachedSerializedDump ?? dump.serialize();
    appendFileSync(this.reportPath, `\n${generateDumpScriptTag(serialized)}`);
  }

  private writeDirectoryReport(
    dump: GroupedActionDump,
    cachedSerializedDump?: string,
  ): void {
    const dir = dirname(this.reportPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // create screenshots subdirectory
    const screenshotsDir = join(dir, 'screenshots');
    if (!existsSync(screenshotsDir)) {
      mkdirSync(screenshotsDir, { recursive: true });
    }

    // 1. write new screenshots as PNG files
    const screenshots = dump.collectAllScreenshots();
    for (const screenshot of screenshots) {
      if (!this.writtenScreenshots.has(screenshot.id)) {
        const buffer = Buffer.from(
          stripBase64Prefix(screenshot.base64),
          'base64',
        );
        writeFileSync(join(screenshotsDir, `${screenshot.id}.png`), buffer);
        this.writtenScreenshots.add(screenshot.id);
      }
    }

    // 2. write HTML with dump JSON referencing ./screenshots/{id}.png paths
    const serialized = this.serializeWithScreenshotPaths(
      dump,
      cachedSerializedDump,
    );
    writeFileSync(
      this.reportPath,
      `${getReportTpl()}\n${generateDumpScriptTag(serialized)}`,
    );
  }

  private serializeWithScreenshotPaths(
    dump: GroupedActionDump,
    cachedSerializedDump?: string,
  ): string {
    // Serialize the dump, then replace screenshot references with file paths
    const jsonStr = cachedSerializedDump ?? dump.serialize();
    const parsed = JSON.parse(jsonStr);

    // Recursively replace { $screenshot: id } with { base64: "./screenshots/{id}.png" }
    const replaceScreenshotRefs = (obj: unknown): unknown => {
      if (Array.isArray(obj)) {
        return obj.map(replaceScreenshotRefs);
      }
      if (obj && typeof obj === 'object') {
        const record = obj as Record<string, unknown>;
        if ('$screenshot' in record && typeof record.$screenshot === 'string') {
          return { base64: `./screenshots/${record.$screenshot}.png` };
        }
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(record)) {
          result[key] = replaceScreenshotRefs(value);
        }
        return result;
      }
      return obj;
    };

    return JSON.stringify(replaceScreenshotRefs(parsed));
  }
}
