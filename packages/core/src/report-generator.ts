import {
  existsSync,
  mkdirSync,
  statSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import {
  MIDSCENE_REPORT_QUIET,
  globalConfigManager,
} from '@midscene/shared/env';
import { ifInBrowser, logMsg } from '@midscene/shared/utils';
import {
  generateDumpScriptTag,
  generateImageScriptTag,
  getBaseUrlFixScript,
} from './dump/html-utils';
import type { ScreenshotItem } from './screenshot-item';
import { type ExecutionDump, type GroupMeta, GroupedActionDump } from './types';
import { appendFileSync, getReportTpl } from './utils';

export interface IReportGenerator {
  /**
   * Write or update a single execution.
   * ReportGenerator internally tracks whether this is a new execution or
   * an update to the current active execution by comparing execution.name.
   *
   * @param execution  Current execution's full data
   * @param groupMeta  Group-level metadata (groupName, sdkVersion, etc.)
   */
  onExecutionUpdate(execution: ExecutionDump, groupMeta: GroupMeta): void;

  /**
   * @deprecated Use onExecutionUpdate instead. Kept for backward compatibility.
   */
  onDumpUpdate?(dump: GroupedActionDump): void;

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
  private screenshotMode: 'inline' | 'directory';
  private autoPrint: boolean;
  private firstWriteDone = false;

  // Tracks screenshots in the FROZEN region (already written and won't be truncated)
  private frozenScreenshots = new Set<string>();

  // per-execution tracking for inline mode
  private activeExecName?: string;
  private activeExecStartOffset = 0;
  // ScreenshotItem references for active execution (needed for markPersistedInline on freeze)
  private activeScreenshotRefs: ScreenshotItem[] = [];
  private initialized = false;

  // write queue for serial execution
  private writeQueue: Promise<void> = Promise.resolve();
  private destroyed = false;

  // Cache for directory mode to track all executions' serialized data
  private directoryDumpCache?: Map<
    string,
    { serialized: string; attributes: Record<string, string> }
  >;

  constructor(options: {
    reportPath: string;
    screenshotMode: 'inline' | 'directory';
    autoPrint?: boolean;
  }) {
    this.reportPath = options.reportPath;
    this.screenshotMode = options.screenshotMode;
    this.autoPrint = options.autoPrint ?? true;
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

  onExecutionUpdate(execution: ExecutionDump, groupMeta: GroupMeta): void {
    this.writeQueue = this.writeQueue.then(() => {
      if (this.destroyed) return;
      this.doWriteExecution(execution, groupMeta);
    });
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  async finalize(): Promise<string | undefined> {
    await this.flush();
    this.destroyed = true;
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
    groupMeta: GroupMeta,
  ): void {
    if (this.screenshotMode === 'inline') {
      this.writeInlineExecution(execution, groupMeta);
    } else {
      this.writeDirectoryExecution(execution, groupMeta);
    }
    if (!this.firstWriteDone) {
      this.firstWriteDone = true;
      this.printReportPath('generated');
    }
  }

  /**
   * Wrap an ExecutionDump + GroupMeta into a single-execution GroupedActionDump.
   */
  private wrapAsGroupedDump(
    execution: ExecutionDump,
    groupMeta: GroupMeta,
  ): GroupedActionDump {
    return new GroupedActionDump({
      sdkVersion: groupMeta.sdkVersion,
      groupName: groupMeta.groupName,
      groupDescription: groupMeta.groupDescription,
      modelBriefs: groupMeta.modelBriefs,
      deviceType: groupMeta.deviceType,
      executions: [execution],
    });
  }

  /**
   * Transition the active execution's screenshots to frozen state.
   * Called when a new execution starts, making the previous active region immutable.
   */
  private freezeActiveExecution(): void {
    // Move active screenshots to frozen set
    for (const screenshot of this.activeScreenshotRefs) {
      this.frozenScreenshots.add(screenshot.id);
      // Now safe to release memory — the screenshot is in the frozen region
      screenshot.markPersistedInline(this.reportPath);
    }
    this.activeScreenshotRefs = [];
  }

  private writeInlineExecution(
    execution: ExecutionDump,
    groupMeta: GroupMeta,
  ): void {
    const dir = dirname(this.reportPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // 0. Initialize: write HTML template
    if (!this.initialized) {
      writeFileSync(this.reportPath, getReportTpl());
      this.activeExecStartOffset = statSync(this.reportPath).size;
      this.initialized = true;
    }

    // 1. Check if this is a new execution or an update to the active one
    if (this.activeExecName !== execution.name) {
      if (this.activeExecName !== undefined) {
        // Freeze previous active execution's screenshots (move to frozen set)
        this.freezeActiveExecution();
      }

      // The current file end becomes the new frozen baseline
      this.activeExecStartOffset = statSync(this.reportPath).size;
      this.activeExecName = execution.name;
    }

    // 2. Truncate: remove active exec's screenshots and dump tag, keep frozen region
    truncateSync(this.reportPath, this.activeExecStartOffset);
    // Reset active screenshot refs — they will be re-collected below
    this.activeScreenshotRefs = [];

    // 3. Append active exec's screenshots
    // Only skip screenshots that are in the FROZEN region (already persisted)
    const screenshots = execution.collectScreenshots();
    for (const screenshot of screenshots) {
      if (!this.frozenScreenshots.has(screenshot.id)) {
        appendFileSync(
          this.reportPath,
          `\n${generateImageScriptTag(screenshot.id, screenshot.base64)}`,
        );
        // Track this screenshot as part of the active region
        // Do NOT markPersistedInline — active region may be truncated
        this.activeScreenshotRefs.push(screenshot);
      }
    }

    // 4. Append dump tag (GroupedActionDump with single execution + data-group-id)
    const singleDump = this.wrapAsGroupedDump(execution, groupMeta);
    const serialized = singleDump.serialize();
    const attributes: Record<string, string> = {
      'data-group-id': groupMeta.groupName,
    };
    appendFileSync(
      this.reportPath,
      `\n${generateDumpScriptTag(serialized, attributes)}`,
    );
  }

  private writeDirectoryExecution(
    execution: ExecutionDump,
    groupMeta: GroupMeta,
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

    // 1. Write new screenshots and release memory immediately
    // In directory mode, screenshots are separate files (never truncated), so safe to persist
    const screenshots = execution.collectScreenshots();
    for (const screenshot of screenshots) {
      if (!this.frozenScreenshots.has(screenshot.id)) {
        const ext = screenshot.extension;
        const absolutePath = join(screenshotsDir, `${screenshot.id}.${ext}`);
        const buffer = Buffer.from(screenshot.rawBase64, 'base64');
        writeFileSync(absolutePath, buffer);
        this.frozenScreenshots.add(screenshot.id);
        screenshot.markPersistedToPath(
          `./screenshots/${screenshot.id}.${ext}`,
          absolutePath,
        );
      }
    }

    // 2. Track execution name
    if (this.activeExecName !== execution.name) {
      this.activeExecName = execution.name;
    }

    if (!this.initialized) {
      this.initialized = true;
    }

    // 3. Update the serialized dump for this execution
    const singleDump = this.wrapAsGroupedDump(execution, groupMeta);
    const serialized = singleDump.serialize();
    const dumpAttributes: Record<string, string> = {
      'data-group-id': groupMeta.groupName,
    };

    if (!this.directoryDumpCache) {
      this.directoryDumpCache = new Map();
    }
    this.directoryDumpCache.set(execution.name, {
      serialized,
      attributes: dumpAttributes,
    });

    // 4. Write the full HTML file with all dump tags
    let content = `${getReportTpl()}${getBaseUrlFixScript()}`;
    for (const entry of this.directoryDumpCache.values()) {
      content += `\n${generateDumpScriptTag(entry.serialized, entry.attributes)}`;
    }
    writeFileSync(this.reportPath, content);
  }
}
