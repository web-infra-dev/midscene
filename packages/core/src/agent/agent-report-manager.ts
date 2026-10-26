import { getDebug } from '@midscene/shared/logger';
import { assert, ifInBrowser, uuid } from '@midscene/shared/utils';
import { IS_REPORT_BUILD } from '../constants';
import { generateTestRunReportScriptTag } from '../dump/html-utils';
import { type IReportGenerator, ReportGenerator } from '../report-generator';
import type { TaskRunner } from '../task-runner';
import { WorkflowError } from '../test-runner/errors';
import type { WorkflowExecutionRecord } from '../test-runner/execution-record';
import { buildAgentTestRunReportDump } from '../test-runner/reporting/agent-report';
import { executionRecordsToReportInput } from '../test-runner/reporting/execution-record';
import {
  type AgentOpt,
  type ExecutionDump,
  ReportActionDump,
  type ReportMeta,
} from '../types';
import { getVersion, reportHTMLContent } from '../utils';
import { getReportFileName } from './utils';

const warn = getDebug('agent', { console: true });

type ReportOptions = Pick<
  AgentOpt,
  | 'groupName'
  | 'groupDescription'
  | 'generateReport'
  | 'persistExecutionDump'
  | 'outputFormat'
  | 'autoPrintReportMsg'
  | 'reportAttributes'
  | 'reportFileName'
  | 'testId'
>;

interface AgentReportContext {
  getOptions(): ReportOptions;
  getDeviceType(): ReportActionDump['deviceType'];
  isDestroyed(): boolean;
  isExternallyBusy(): boolean;
}

interface AgentReportState {
  dump: ReportActionDump;
  file?: string | null;
  fileName?: string;
  generator: IReportGenerator;
  finalization?: Promise<string | undefined>;
  lastExecution?: ExecutionDump;
  executionIndexByRunner: WeakMap<TaskRunner, number>;
  yamlScopeId: string;
  yamlRecords: WorkflowExecutionRecord[];
  activeOperations: Set<Promise<unknown>>;
}

/** Owns report state and persistence; execution and device ownership stay with Agent. */
export class AgentReportManager {
  private reportState: AgentReportState;
  private reportReset?: Promise<ReportActionDump>;
  private readonly reportByRunner = new WeakMap<TaskRunner, AgentReportState>();
  private dumpUpdateListeners: Array<
    (dump: string, executionDump?: ExecutionDump) => void
  > = [];

  constructor(private readonly context: AgentReportContext) {
    const opts = this.opts;
    const fileName =
      opts.reportFileName ??
      getReportFileName(opts.testId || context.getDeviceType() || 'web');
    this.reportState = this.createReportState(
      fileName,
      opts.reportAttributes?.['data-group-id'] === fileName,
    );
  }

  private get opts(): ReportOptions {
    return this.context.getOptions();
  }

  get dump(): ReportActionDump {
    return this.reportState.dump;
  }
  set dump(value: ReportActionDump) {
    this.reportState.dump = value;
  }

  get reportFile(): string | null | undefined {
    return this.reportState.file;
  }
  set reportFile(value: string | null | undefined) {
    this.reportState.file = value;
  }

  get reportFileName(): string | undefined {
    return this.reportState.fileName;
  }
  set reportFileName(value: string | undefined) {
    this.reportState.fileName = value;
  }

  /** @internal Runner snapshots retain immutable data and shared image files. */
  _prepareForTestRunner(): void {
    this.reportState.generator.enableSourceSnapshots?.();
  }
  async _createReportSource(scopeId: string, executionIds?: readonly string[]) {
    return this.reportState.generator.createSourceSnapshot?.(
      scopeId,
      executionIds,
    );
  }

  /** @internal The Agent owns one report stream across root YAML invocations. */
  async _writeYamlExecutionReport(
    record: WorkflowExecutionRecord,
  ): Promise<string | undefined> {
    const report = this.reportState;
    const existingIndex = report.yamlRecords.findIndex(
      (entry) => entry.runId === record.runId,
    );
    const recordIndex =
      existingIndex < 0 ? report.yamlRecords.length : existingIndex;
    report.yamlRecords[recordIndex] = record;
    try {
      const path = await report.generator.writeRunnerReport?.(
        this.buildYamlReportInput(),
        report.yamlScopeId,
        this.getReportMeta(),
      );
      report.file = path ?? report.file;
      return path;
    } catch (error) {
      report.yamlRecords[recordIndex] = Object.freeze({
        ...record,
        status: 'failed',
        reportError: error,
      });
      throw error;
    }
  }

  private buildYamlReportInput() {
    const scopedRecords = this.reportState.yamlRecords.map((entry) => ({
      ...entry,
      ...(entry.execution
        ? {
            execution: {
              document: {
                ...entry.execution.document,
                reportScopeId: this.reportState.yamlScopeId,
              },
              cases: entry.execution.cases.map((outcome) => ({
                ...outcome,
                ...(outcome.run
                  ? {
                      run: {
                        ...outcome.run,
                        reportScopeId: this.reportState.yamlScopeId,
                      },
                    }
                  : {}),
                ...(outcome.attempts
                  ? {
                      attempts: outcome.attempts.map((attempt) => ({
                        ...attempt,
                        reportScopeId: this.reportState.yamlScopeId,
                      })),
                    }
                  : {}),
              })),
            },
          }
        : {}),
    }));
    return executionRecordsToReportInput(scopedRecords, {
      runId: this.reportState.yamlScopeId,
    });
  }

  private createEmptyDump(): ReportActionDump {
    return new ReportActionDump({
      sdkVersion: getVersion(),
      groupName: this.opts.groupName!,
      groupDescription: this.opts.groupDescription,
      executions: [],
      modelBriefs: [],
      deviceType: this.context.getDeviceType(),
    });
  }

  private createReportState(
    fileName: string,
    reuseExistingReport = false,
  ): AgentReportState {
    return {
      dump: this.createEmptyDump(),
      fileName,
      generator: ReportGenerator.create(fileName, {
        generateReport: this.opts.generateReport,
        persistExecutionDump: this.opts.persistExecutionDump,
        outputFormat: this.opts.outputFormat,
        autoPrintReportMsg: this.opts.autoPrintReportMsg,
        reuseExistingReport,
      }),
      executionIndexByRunner: new WeakMap(),
      yamlScopeId: uuid(),
      yamlRecords: [],
      activeOperations: new Set(),
    };
  }

  private clearDumpInMemory(report = this.reportState): void {
    report.dump = this.createEmptyDump();
    report.executionIndexByRunner = new WeakMap();
    report.lastExecution = undefined;
    report.yamlRecords.length = 0;
  }

  private assertReportIdle(): void {
    assert(
      !this.reportState.activeOperations.size &&
        !this.context.isExternallyBusy(),
      'Cannot reset or finalize a report while the Agent is executing. Await the active operation first.',
    );
  }

  assertReportWritable(): AgentReportState {
    const report = this.reportState;
    assert(
      !this.context.isDestroyed(),
      'Cannot execute using a destroyed Agent.',
    );
    assert(
      !this.reportReset,
      'Report reset is in progress. Await resetDump() first.',
    );
    assert(
      !report.finalization,
      'The report has been finalized. Call and await resetDump() before executing again.',
    );
    return report;
  }

  async withReportOperation<T>(operation: () => Promise<T>): Promise<T> {
    const report = this.assertReportWritable();
    const pending = Promise.resolve().then(operation);
    report.activeOperations.add(pending);
    try {
      return await pending;
    } finally {
      report.activeOperations.delete(pending);
    }
  }

  /**
   * Finalize the preceding report and reset execution records for a new report.
   * Historical artifacts are retained; this Agent and its device stay connected.
   * Await this method before executing again. Concurrent resets share one reset.
   */
  async resetDump(): Promise<ReportActionDump> {
    assert(
      !this.context.isDestroyed(),
      'Cannot reset a report using a destroyed Agent.',
    );
    if (this.reportReset) return this.reportReset;
    this.assertReportIdle();
    this.reportReset = (async () => {
      try {
        await this.finalizeReport();
      } catch (error) {
        // Failure belongs to the preceding report, not to the next write queue.
        warn(
          `Failed to finalize previous report; resetting dump: ${String(error)}`,
        );
      }
      assert(
        !this.context.isDestroyed(),
        'Cannot reset a report using a destroyed Agent.',
      );
      const fileName = getReportFileName(
        this.opts.testId || this.context.getDeviceType() || 'web',
      );
      this.reportState = this.createReportState(fileName);
      return this.dump;
    })();
    try {
      return await this.reportReset;
    } finally {
      this.reportReset = undefined;
    }
  }

  /**
   * Seal the current report and release its in-memory records without
   * disconnecting the device. Export in-memory data before calling this method.
   * Repeated calls return the same result and never rewrite published artifacts.
   */
  async finalizeReport(): Promise<string | undefined> {
    const report = this.reportState;
    if (!report.finalization) {
      this.assertReportIdle();
      report.finalization = (async () => {
        await report.generator.flush();
        const path = await report.generator.finalize();
        report.file = path;
        this.clearDumpInMemory(report);
        return path;
      })();
    }
    return report.finalization;
  }

  appendExecutionDump(execution: ExecutionDump, runner?: TaskRunner) {
    assert(
      !this.reportState.finalization,
      'Cannot append to a finalized report. Await resetDump() first.',
    );
    const currentDump = this.dump;
    if (runner) {
      const existingIndex = this.reportState.executionIndexByRunner.get(runner);
      if (existingIndex !== undefined) {
        currentDump.executions[existingIndex] = execution;
        return;
      }
      currentDump.executions.push(execution);
      this.reportState.executionIndexByRunner.set(
        runner,
        currentDump.executions.length - 1,
      );
      return;
    }
    currentDump.executions.push(execution);
  }

  dumpDataString(opt?: { inlineScreenshots?: boolean }) {
    // update dump info
    this.dump.groupName = this.opts.groupName!;
    this.dump.groupDescription = this.opts.groupDescription;
    // In browser environment, use inline screenshots since file system is not available
    if (ifInBrowser || opt?.inlineScreenshots) {
      return this.dump.serializeWithInlineScreenshots();
    }
    return this.dump.serialize();
  }

  reportHTMLString(getDumpString: () => string) {
    // Short-circuit at the call site because JavaScript evaluates function
    // arguments first. This avoids serializing the dump (including inline
    // screenshots) when the Report Viewer build does not need report HTML.
    if (IS_REPORT_BUILD) {
      return '';
    }

    // dumpDataString() handles browser environment with inline screenshots
    const dumpString = getDumpString();
    if (!this.reportState.yamlRecords.length)
      return reportHTMLContent(dumpString);

    // Browser exports have no file writer, so the execution record must own
    // the hierarchy independently of whether file report generation is enabled.
    const reportId = this.reportState.yamlScopeId;
    const runnerDump = buildAgentTestRunReportDump(
      this.buildYamlReportInput(),
      this.dump,
      {
        reportId,
        scopeId: this.reportState.yamlScopeId,
        sourcePath: this.reportFile ?? '<inline-agent-report>',
      },
    );
    return `${reportHTMLContent({
      dumpString,
      attributes: { 'data-group-id': reportId, 'data-report-id': reportId },
    })}\n${generateTestRunReportScriptTag(runnerDump)}`;
  }

  writeOutActionDumps(executionDump?: ExecutionDump) {
    const report = this.reportState;
    if (report.finalization) {
      if (executionDump) {
        throw new WorkflowError(
          'Cannot append to a finalized report. Await resetDump() first.',
          {
            code: 'REPORT_FINALIZED',
          },
        );
      }
      return;
    }
    const exec = executionDump || report.lastExecution;
    if (exec) {
      report.lastExecution = exec;
      report.generator.onExecutionUpdate(
        exec,
        this.getReportMeta(),
        this.opts.reportAttributes,
      );
    }
    report.file = report.generator.getReportPath();
  }

  /** Persist current report data without disposing this Agent or its device. */
  async flushReport(): Promise<string | undefined> {
    if (this.reportReset) await this.reportReset;
    const report = this.reportState;
    if (report.finalization) return report.finalization;
    this.writeOutActionDumps();
    await report.generator.flush();
    return report.lastExecution ? (report.file ?? undefined) : undefined;
  }

  private getReportMeta(): ReportMeta {
    return {
      groupName: this.dump.groupName,
      groupDescription: this.dump.groupDescription,
      sdkVersion: this.dump.sdkVersion,
      modelBriefs: this.dump.modelBriefs,
      deviceType: this.dump.deviceType,
    };
  }

  get onDumpUpdate():
    | ((dump: string, executionDump?: ExecutionDump) => void)
    | undefined {
    return this.dumpUpdateListeners[0];
  }

  set onDumpUpdate(callback:
    | ((dump: string, executionDump?: ExecutionDump) => void)
    | undefined) {
    // Clear existing listeners
    this.dumpUpdateListeners = [];
    // Add callback to array if provided
    if (callback) {
      this.dumpUpdateListeners.push(callback);
    }
  }

  addDumpUpdateListener(
    listener: (dump: string, executionDump?: ExecutionDump) => void,
  ): () => void {
    this.dumpUpdateListeners.push(listener);

    // Return remove function
    return () => {
      this.removeDumpUpdateListener(listener);
    };
  }

  /**
   * Remove a dump update listener
   * @param listener The listener function to remove
   */
  removeDumpUpdateListener(
    listener: (dump: string, executionDump?: ExecutionDump) => void,
  ): void {
    const index = this.dumpUpdateListeners.indexOf(listener);
    if (index > -1) {
      this.dumpUpdateListeners.splice(index, 1);
    }
  }

  /**
   * Clear all dump update listeners
   */
  clearDumpUpdateListeners(): void {
    this.dumpUpdateListeners = [];
  }

  notifyDumpUpdateListeners(executionDump?: ExecutionDump) {
    const dumpString = this.dumpDataString();
    for (const listener of this.dumpUpdateListeners) {
      try {
        listener(dumpString, executionDump);
      } catch (error) {
        console.error('Error in onDumpUpdate listener', error);
      }
    }
  }

  bindRunner(runner: TaskRunner): void {
    this.reportByRunner.set(runner, this.reportState);
  }

  assertRunnerCurrent(runner: TaskRunner): void {
    const report = this.reportByRunner.get(runner);
    assert(
      report === this.reportState && !report.finalization,
      'Cannot write a late execution update into a different or finalized report.',
    );
  }

  async flushPendingWrites(): Promise<void> {
    await this.reportState.generator.flush();
  }

  async waitForOperations(): Promise<void> {
    while (this.reportState.activeOperations.size) {
      await Promise.allSettled([...this.reportState.activeOperations]);
    }
  }

  async waitForReset(): Promise<void> {
    if (this.reportReset) await this.reportReset.catch(() => {});
  }
}
