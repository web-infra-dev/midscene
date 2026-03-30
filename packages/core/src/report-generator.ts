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
  private inlineImageScriptWritten = new Set<string>();
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
    const serialized = this.serializeWithExternalScreenshots(
      singleDump,
      inlineExecutionJson,
    );

    this.writeHtmlDump(execution, serialized);
    this.persistExecutionDump(serialized);

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
   * Convert inline execution JSON to path-based references and always persist
   * screenshots to disk, regardless of report mode.
   */
  private serializeWithExternalScreenshots(
    singleDump: ReportActionDump,
    inlineExecutionJson: string,
  ): string {
    const dir = dirname(this.reportPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const screenshotsDir = join(dir, 'screenshots');
    if (!existsSync(screenshotsDir)) {
      mkdirSync(screenshotsDir, { recursive: true });
    }

    const serialized = convertExecutionInlineJsonToReportDump({
      serializedExecutionJson: inlineExecutionJson,
      screenshotsDir,
      hashToRelativePath: this.screenshotHashToPath,
    });

    const screenshots = singleDump.collectAllScreenshots();
    for (const screenshot of screenshots) {
      if (this.writtenScreenshots.has(screenshot.id)) continue;
      const hash = createHash('sha256').update(screenshot.base64).digest('hex');
      const hashedPath = this.screenshotHashToPath.get(hash);
      if (!hashedPath) {
        throw new Error(`Missing screenshot path for hash ${hash}`);
      }
      screenshot.markPersistedToPath(
        hashedPath,
        join(dir, hashedPath.replace('./', '')),
      );
      this.writtenScreenshots.add(screenshot.id);
    }

    return serialized;
  }

  /**
   * Write dump tags for all modes.
   * Inline mode additionally appends inline image scripts for portability.
   */
  private writeHtmlDump(execution: ExecutionDump, serialized: string): void {
    const dir = dirname(this.reportPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (!this.initialized) {
      const baseHtml =
        this.screenshotMode === 'directory'
          ? `${getReportTpl()}${getBaseUrlFixScript()}`
          : getReportTpl();
      writeFileSync(this.reportPath, baseHtml);
      this.initialized = true;
    }

    if (this.screenshotMode === 'inline') {
      const screenshots = execution.collectScreenshots();
      for (const screenshot of screenshots) {
        if (this.inlineImageScriptWritten.has(screenshot.id)) continue;
        appendFileSync(
          this.reportPath,
          `\n${generateImageScriptTag(screenshot.id, screenshot.base64)}`,
        );
        this.inlineImageScriptWritten.add(screenshot.id);
      }
    }

    const dumpAttributes: Record<string, string> = {
      'data-group-id': this.reportStreamId,
    };

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
