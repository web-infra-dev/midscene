import { mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { uuid } from '@midscene/shared/utils';
import { createExecutionContext } from '#yaml-execution-context';
import type { IReportGenerator } from '../report-generator';
import type { WorkflowReportSource } from '../test-runner/engine/types';
import type { ExecutionDump, ReportAttributes, ReportMeta } from '../types';
import {
  type ExecutionRecordSnapshot,
  ExecutionRecorder,
} from './execution-recorder';
import { normalizeStoredImageRef } from './image-reference';
import {
  ReportArtifactStore,
  writeReportArtifactFile,
} from './report-artifact-store';
import { type ImageUrlRef, ReportImageStore } from './screenshot-store';

const contextKey = Symbol.for('@midscene/core/report-session/v1');
const host = globalThis as typeof globalThis & {
  [contextKey]?: ReturnType<typeof createExecutionContext<ReportSession>>;
};
host[contextKey] ??= createExecutionContext<ReportSession>();
const context = host[contextKey];

/** The execution host owns the records; Agents do not publish independent pages. */
export class ReportSession {
  private readonly writers = new Set<ReportSourceRecorder>();
  private ended = false;
  private completion?: Promise<WorkflowReportSource[]>;
  private ownership?: Promise<void>;

  constructor(readonly directory: string) {
    if (!isAbsolute(directory))
      throw new Error('Report session directory must be absolute.');
  }

  async run<T>(callback: () => Promise<T>): Promise<T> {
    if (this.ended) throw new Error('The report session has ended.');
    this.ownership ??= (async () => {
      await mkdir(dirname(this.directory), { recursive: true });
      await mkdir(this.directory);
    })();
    await this.ownership;
    return context.run(this, callback);
  }

  createRecorder(isBusy: () => boolean): ReportSourceRecorder {
    if (!this.ownership)
      throw new Error('Start the report session before creating a writer.');
    if (this.ended)
      throw new Error('Cannot add a writer to an ended report session.');
    const writer = new ReportSourceRecorder(this.directory, isBusy);
    this.writers.add(writer);
    return writer;
  }

  /** Persist untraced setup/teardown evidence too, without waiting on device calls. */
  async finish(): Promise<WorkflowReportSource[]> {
    this.ended = true;
    this.completion ??= (async () => {
      const sources: WorkflowReportSource[] = [];
      for (const writer of this.writers) {
        const source = await writer.captureUncollected();
        if (source) sources.push(source);
        if (!writer.isBusy()) await writer.finalize();
        else await writer.flush();
      }
      return sources;
    })();
    return this.completion;
  }

  /** Cutoff records remain authoritative facts; discard replaceable progress only after delivery. */
  async prune(): Promise<void> {
    if (!this.completion)
      throw new Error('Finish the report session before pruning it.');
    await this.completion;
    if (!this.writers.size) {
      await rm(this.directory, { recursive: true, force: true });
      return;
    }
    if ([...this.writers].some((writer) => writer.isBusy())) return;
    await rm(join(this.directory, 'data'), { recursive: true, force: true });
    await rm(join(this.directory, 'report.json'), { force: true });
    const retained = new Set(
      [...this.writers].flatMap((writer) => [...writer.snapshotImages]),
    );
    const images = join(this.directory, 'screenshots');
    const files = await readdir(images).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const file of files)
      if (!retained.has(`./screenshots/${file}`)) await rm(join(images, file));
  }
}

export const currentReportSession = (): ReportSession | undefined =>
  context.getStore();

/** Structured Agent records and immutable Step cutoffs, with shared image assets. */
class ReportSourceRecorder implements IReportGenerator {
  readonly snapshotImages = new Set<string>();
  private readonly recorder = new ExecutionRecorder();
  private readonly id = uuid();
  private readonly images: ReportImageStore;
  private readonly store: ReportArtifactStore;
  private readonly collected = new Set<string>();
  private sourcePath?: string;
  private queue: Promise<void> = Promise.resolve();
  private finalization?: Promise<undefined>;

  constructor(
    private readonly directory: string,
    readonly isBusy: () => boolean,
  ) {
    this.images = new ReportImageStore({
      mode: 'directory',
      reportPath: join(directory, `${this.id}.json`),
      screenshotsDir: join(directory, 'screenshots'),
    });
    this.store = new ReportArtifactStore(directory, this.id, 'test', true);
  }

  getReportPath(): undefined {
    return undefined;
  }
  enableSourceSnapshots(): void {}

  onExecutionUpdate(
    execution: ExecutionDump,
    meta: ReportMeta,
    attributes: ReportAttributes = {},
  ): void {
    if (this.finalization)
      throw new Error('The report record stream has been finalized.');
    const key = this.recorder.record(execution, meta);
    const update = new ExecutionRecorder();
    update.record(execution, meta);
    const captured = update.capture();
    this.queue = this.queue.then(async () => {
      const serialized = await this.serialize(captured);
      await this.store.writeExecution(
        key,
        serialized,
        Object.fromEntries(
          Object.entries(attributes).map(([key, value]) => [
            key,
            String(value),
          ]),
        ),
      );
    });
  }

  private async serialize(captured: ExecutionRecordSnapshot): Promise<string> {
    for (const screenshot of captured.screenshots)
      await this.images.persist(screenshot);
    const references = new Map<string, ImageUrlRef>();
    for (const url of captured.referenceImageUrls)
      references.set(url, await this.images.persistReferenceImage(url));
    return JSON.stringify(
      JSON.parse(captured.dump.serializeWithReferenceImages(references)),
      (_key, value) => {
        const ref = normalizeStoredImageRef(value);
        if (!ref) return value;
        return {
          ...ref,
          storage: 'file',
          path: this.images.getFilePath(ref.id),
        };
      },
    );
  }

  async createSourceSnapshot(
    scopeId: string,
    executionIds?: readonly string[],
  ): Promise<WorkflowReportSource> {
    if (typeof scopeId !== 'string' || !scopeId.trim())
      throw new Error('Invalid report scope ID');
    // Freeze before any I/O: late progress cannot mutate this Step's evidence.
    const captured = this.recorder.capture(
      executionIds,
      this.recorder.reportMeta ?? {
        sdkVersion: '',
        groupName: 'Test execution',
        modelBriefs: [],
      },
    );
    const path = join(this.directory, `${this.id}.${uuid()}.json`);
    const publication = this.queue.then(async () => {
      const serialized = await this.serialize(captured);
      await writeReportArtifactFile(path, serialized);
      JSON.parse(serialized, (_key, value) => {
        const ref = normalizeStoredImageRef(value);
        if (ref?.path) this.snapshotImages.add(ref.path);
        return value;
      });
      this.sourcePath ??= path;
      for (const execution of captured.dump.executions)
        if (execution.id) this.collected.add(execution.id);
    });
    this.queue = publication;
    await publication;
    return {
      sourcePath: this.sourcePath!,
      dumpPath: path,
      collection: {
        status: this.isBusy() ? 'partial' : 'complete',
        capturedAt: captured.capturedAt,
        ...(this.isBusy()
          ? {
              reason:
                'An Agent operation was still running at the snapshot cutoff.',
            }
          : {}),
      },
    };
  }

  async captureUncollected(): Promise<WorkflowReportSource | undefined> {
    const ids = this.recorder.executions.flatMap((execution) =>
      execution.id && !this.collected.has(execution.id) ? [execution.id] : [],
    );
    return ids.length ? this.createSourceSnapshot(this.id, ids) : undefined;
  }

  async flush(): Promise<void> {
    await this.queue;
  }

  async finalize(): Promise<undefined> {
    if (!this.finalization)
      this.finalization = (async () => {
        await this.flush();
        await this.store.finalize();
        return undefined;
      })();
    return this.finalization;
  }
}
