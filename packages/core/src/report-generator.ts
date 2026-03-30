import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import {
  MIDSCENE_REPORT_QUIET,
  globalConfigManager,
} from '@midscene/shared/env';
import { ifInBrowser, logMsg, uuid } from '@midscene/shared/utils';
import { convertExecutionInlineJsonToReportDump } from './dump/execution-json-converter';
import {
  generateDumpScriptTag,
  generateImageScriptTag,
  getBaseUrlFixScript,
} from './dump/html-utils';
import { type ExecutionDump, ReportActionDump, type ReportMeta } from './types';
import { appendFileSync, getReportTpl } from './utils';

export interface IReportGenerator {
  /**
   * Write or update a single execution.
   * Each call appends a new dump script tag. The frontend deduplicates
   * executions with the same id/name, keeping only the last one.
   *
   * @param execution  Current execution's full data
   * @param reportMeta  Report-level metadata (groupName, sdkVersion, etc.)
   */
  onExecutionUpdate(execution: ExecutionDump, reportMeta: ReportMeta): void;

  /**
   * @deprecated Use onExecutionUpdate instead. Kept for backward compatibility.
   */
  onDumpUpdate?(dump: ReportActionDump): void;

  /**
   * Wait for all queued write operations to complete.
   */
  flush(): Promise<void>;

  /**
   * Finalize the report. Calls flush() internally.
   */
  finalize(): Promise<string | undefined>;

  getReportPath(): string | undefined;
}

export const nullReportGenerator: IReportGenerator = {
  onExecutionUpdate: () => {},
  flush: async () => {},
  finalize: async () => undefined,
  getReportPath: () => undefined,
};

export class ReportGenerator implements IReportGenerator {
  private reportPath: string;
  private executionLogDir: string;
  private screenshotMode: 'inline' | 'directory';
  private autoPrint: boolean;
  private firstWriteDone = false;
  private executionLogIndex = 0;

  // Unique identifier for this report stream — used as data-group-id
  private readonly reportStreamId: string;

  // Tracks screenshots already written to disk (by id) to avoid duplicates
  private writtenScreenshots = new Set<string>();
  private screenshotHashToPath = new Map<string, string>();
  private initialized = false;

  // Tracks the last execution + groupMeta for re-writing on finalize
  private lastExecution?: ExecutionDump;
  private lastReportMeta?: ReportMeta;

  // write queue for serial execution
  private writeQueue: Promise<void> = Promise.resolve();
  private destroyed = false;

  constructor(options: {
    reportPath: string;
    screenshotMode: 'inline' | 'directory';
    autoPrint?: boolean;
  }) {
    this.reportPath = options.reportPath;
    this.executionLogDir = join(dirname(this.reportPath), 'executions');
    this.screenshotMode = options.screenshotMode;
    this.autoPrint = options.autoPrint ?? true;
    this.reportStreamId = uuid();
    this.printReportPath('will be generated at');
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

  onExecutionUpdate(execution: ExecutionDump, reportMeta: ReportMeta): void {
    this.lastExecution = execution;
    this.lastReportMeta = reportMeta;
    this.writeQueue = this.writeQueue.then(() => {
      if (this.destroyed) return;
      this.doWriteExecution(execution, reportMeta);
    });
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  async finalize(): Promise<string | undefined> {
    // Re-write the last execution to capture any final state changes
    if (this.lastExecution && this.lastReportMeta) {
      this.onExecutionUpdate(this.lastExecution, this.lastReportMeta);
    }
    await this.flush();
    this.destroyed = true;

    if (!this.initialized) {
      // No executions were ever written — no file exists
      return undefined;
    }

    this.printReportPath('finalized');
    return this.reportPath;
  }

  getReportPath(): string | undefined {
    return this.reportPath;
  }

  private printReportPath(verb: string): void {
    if (!this.autoPrint || !this.reportPath) return;
    if (globalConfigManager.getEnvConfigInBoolean(MIDSCENE_REPORT_QUIET))
      return;

    if (this.screenshotMode === 'directory') {
      logMsg(
        `Midscene - report ${verb}: npx serve ${dirname(this.reportPath)}`,
      );
    } else {
      logMsg(`Midscene - report ${verb}: ${this.reportPath}`);
    }
  }

  private doWriteExecution(
    execution: ExecutionDump,
    reportMeta: ReportMeta,
  ): void {
    const singleDump = this.wrapAsReportDump(execution, reportMeta);
    const inlineExecutionJson = singleDump.serializeWithInlineScreenshots();

    if (this.screenshotMode === 'inline') {
      this.writeInlineExecution(execution, singleDump);
    } else {
      this.writeDirectoryExecution(singleDump, inlineExecutionJson);
    }

    this.persistExecutionDump(inlineExecutionJson);

    if (!this.firstWriteDone) {
      this.firstWriteDone = true;
      this.printReportPath('generated');
    }
  }

  /**
   * Wrap an ExecutionDump + ReportMeta into a single-execution ReportActionDump.
   */
  private wrapAsReportDump(
    execution: ExecutionDump,
    reportMeta: ReportMeta,
  ): ReportActionDump {
    return new ReportActionDump({
      sdkVersion: reportMeta.sdkVersion,
      groupName: reportMeta.groupName,
      groupDescription: reportMeta.groupDescription,
      modelBriefs: reportMeta.modelBriefs,
      deviceType: reportMeta.deviceType,
      executions: [execution],
    });
  }

  /**
   * Append-only inline mode: write new screenshots and a dump tag on every call.
   * The frontend deduplicates executions with the same id/name (keeps last).
   * Duplicate dump JSON is acceptable; only screenshots are deduplicated.
   */
  private writeInlineExecution(
    execution: ExecutionDump,
    singleDump: ReportActionDump,
  ): void {
    const dir = dirname(this.reportPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Initialize: write HTML template once
    if (!this.initialized) {
      writeFileSync(this.reportPath, getReportTpl());
      this.initialized = true;
    }

    // Append new screenshots (skip already-written ones)
    const screenshots = execution.collectScreenshots();
    for (const screenshot of screenshots) {
      if (!this.writtenScreenshots.has(screenshot.id)) {
        appendFileSync(
          this.reportPath,
          `\n${generateImageScriptTag(screenshot.id, screenshot.base64)}`,
        );
        this.writtenScreenshots.add(screenshot.id);
        // Safe to release memory — the image tag is permanent (never truncated)
        screenshot.markPersistedInline(this.reportPath);
      }
    }

    // Append dump tag (always — frontend keeps only last per execution id)
    const serialized = singleDump.serialize();
    const attributes: Record<string, string> = {
      'data-group-id': this.reportStreamId,
    };
    appendFileSync(
      this.reportPath,
      `\n${generateDumpScriptTag(serialized, attributes)}`,
    );
  }

  private writeDirectoryExecution(
    singleDump: ReportActionDump,
    inlineExecutionJson: string,
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

    // 1. Convert inline execution JSON to directory-compatible dump:
    //    - extract inline base64 screenshots to files
    //    - dedupe same image content by hash
    //    - output screenshot references as relative paths
    const serialized = convertExecutionInlineJsonToReportDump({
      serializedExecutionJson: inlineExecutionJson,
      screenshotsDir,
      hashToRelativePath: this.screenshotHashToPath,
    });

    // 2. Keep ScreenshotItem lazy-load behavior for in-memory execution objects
    const screenshots = singleDump.collectAllScreenshots();
    for (const screenshot of screenshots) {
      if (!this.writtenScreenshots.has(screenshot.id)) {
        const hash = createHash('sha256')
          .update(screenshot.base64)
          .digest('hex');
        const hashedPath = this.screenshotHashToPath.get(hash);
        if (hashedPath) {
          screenshot.markPersistedToPath(
            hashedPath,
            join(dir, hashedPath.replace('./', '')),
          );
        }
        this.writtenScreenshots.add(screenshot.id);
      }
    }

    const dumpAttributes: Record<string, string> = {
      'data-group-id': this.reportStreamId,
    };

    if (!this.initialized) {
      writeFileSync(
        this.reportPath,
        `${getReportTpl()}${getBaseUrlFixScript()}`,
      );
      this.initialized = true;
    }

    appendFileSync(
      this.reportPath,
      `\n${generateDumpScriptTag(serialized, dumpAttributes)}`,
    );
  }

  private persistExecutionDump(serializedExecutionJson: string): void {
    if (!existsSync(this.executionLogDir)) {
      mkdirSync(this.executionLogDir, { recursive: true });
    }

    this.executionLogIndex += 1;
    const fileName = `${this.executionLogIndex}.json`;
    const filePath = join(this.executionLogDir, fileName);
    writeFileSync(filePath, serializedExecutionJson);
  }
}
