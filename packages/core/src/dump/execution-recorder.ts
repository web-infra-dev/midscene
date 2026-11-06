import type { ScreenshotItem } from '../screenshot-item';
import {
  type ExecutionDump,
  ReportActionDump,
  type ReportMeta,
} from '../types';

export interface ExecutionRecordSnapshot {
  capturedAt: string;
  dump: ReportActionDump;
  screenshots: ScreenshotItem[];
  referenceImageUrls: string[];
}

/** Execution facts and immutable cutoffs, independent of HTML and file I/O. */
export class ExecutionRecorder {
  private readonly records = new Map<string, ExecutionDump>();
  private anonymousKeys = new WeakMap<ExecutionDump, string>();
  private nextAnonymousKey = 0;
  private meta?: ReportMeta;

  record(execution: ExecutionDump, meta: ReportMeta): string {
    this.meta = meta;
    let key = execution.id
      ? `id:${execution.id}`
      : this.anonymousKeys.get(execution);
    if (!key) {
      key = `anonymous:${++this.nextAnonymousKey}`;
      this.anonymousKeys.set(execution, key);
    }
    this.records.set(key, execution);
    return key;
  }

  get executions(): ExecutionDump[] {
    return [...this.records.values()];
  }

  get reportMeta(): ReportMeta | undefined {
    return this.meta;
  }

  toDump(meta = this.meta): ReportActionDump {
    if (!meta)
      throw new Error('Cannot create a report without execution metadata');
    return new ReportActionDump({ ...meta, executions: this.executions });
  }

  /** Freeze facts before any asynchronous asset writes or subsequent progress. */
  capture(
    executionIds?: readonly string[],
    meta = this.meta,
  ): ExecutionRecordSnapshot {
    const selected = executionIds ? new Set(executionIds) : undefined;
    const executions = this.executions.filter(
      (execution) => !selected || (execution.id && selected.has(execution.id)),
    );
    if (!meta)
      throw new Error('Cannot capture a report without execution metadata');
    return {
      capturedAt: new Date().toISOString(),
      screenshots: executions.flatMap((execution) =>
        execution.collectScreenshots(),
      ),
      referenceImageUrls: [
        ...new Set(
          executions.flatMap((execution) => [
            ...execution.getReferenceImageUrls(),
          ]),
        ),
      ],
      dump: ReportActionDump.fromSerializedString(
        new ReportActionDump({ ...meta, executions }).serialize(),
      ),
    };
  }

  clear(): void {
    this.records.clear();
    this.anonymousKeys = new WeakMap();
    this.meta = undefined;
  }
}
