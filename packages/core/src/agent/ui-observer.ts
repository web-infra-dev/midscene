import {
  type UIObservationRecordMetadata,
  UIObservationRecordWriter,
  cloneUIObservationRecord,
} from '@midscene/shared/agent-tools/observation-record';
import { observationTimingSchema } from '@midscene/shared/agent-tools/observation-timing';
import type {
  BaseUIObserverOptions,
  UIObservationEvent,
  UIObservationFrame,
  UIObservationRecord,
} from '@midscene/shared/agent-tools/types';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { TUserPrompt } from '../common';
import type { DeviceFrameRef, DeviceFrameSource } from '../device';
import { ScreenshotItem } from '../screenshot-item';
import type {
  AgentAssertResult,
  InsightAPI,
  ObservationAssertOptions,
  ObservationQueryOptions,
  ServiceExtractParam,
  UIContext,
} from '../types';
import {
  type BufferedObservationFrame,
  ObservationFrameBuffer,
} from './observation-frame-buffer';
import { prepareScreenshotForPersistence } from './screenshot-preparation';

const debug = getDebug('ui-observer');
const warnObserver = getDebug('ui-observer', { console: true });

const DEFAULT_INTERVAL_MS = 1000;
const MIN_INTERVAL_MS = 20;
const DEFAULT_MAX_FRAMES = 30;
const FIRST_FRAME_TIMEOUT_MS = 3000;
const DEFAULT_WATCHDOG_MS = 5 * 60 * 1000;
const MAX_FRAMES_PER_RECORD = 50;
const DECODE_BATCH_SIZE = 4;

/** Options for a UI observation window. */
export type UIObserverOption = BaseUIObserverOptions;

interface UIObserverDeps {
  openFrameSource: () => Promise<DeviceFrameSource | undefined>;
  captureRawScreenshot: () => Promise<string>;
  capturePreparedRepresentative: () => Promise<UIContext>;
  createInsight: (record: UIObservationRecord) => InsightAPI;
  onStopped?: () => void;
  onDisposed?: () => void;
  screenshotShrinkFactor?: number;
  /** Test/internal persistence override; not part of the Agent SDK options. */
  observationRecordWriter?: UIObservationRecordWriter;
}

/** A fixed screen-recording window that supports read-only AI insights. */
export interface UIObservation
  extends InsightAPI<ObservationQueryOptions, ObservationAssertOptions> {
  /** Number of captured frames in the fixed observation window. */
  readonly frameCount: number;
  /** Timestamp when screen sampling started. */
  readonly startedAt: number;
  /** Timestamp when screen sampling ended. */
  readonly endedAt: number;
  /** Detached, file-backed frame times and explicit input-event evidence. */
  exportRecord(): Promise<UIObservationRecord>;
  /** Release image files owned by this observation. Failed cleanup is retryable. */
  dispose(): Promise<void>;
}

/** Recording lifecycle returned by {@link Agent.startObserving}. */
export interface UIObserver {
  /** Number of frames currently buffered while recording. */
  readonly bufferedFrameCount: number;
  /** Add an externally measured event; never infers clock alignment or trigger semantics. */
  recordEvent(event: UIObservationEvent): void;
  /** Stop recording and return its fixed observation window. */
  stop(): Promise<UIObservation>;
  /** Stop recording if needed and release its image files. */
  dispose(): Promise<void>;
}

/** @internal Concrete fixed-window implementation. */
export class UIObservationImpl implements UIObservation {
  private disposed = false;
  private readonly record: UIObservationRecord;

  constructor(
    record: UIObservationRecord,
    private readonly insight: InsightAPI,
    private readonly disposeRecord?: () => void,
    private readonly onDisposed?: () => void,
  ) {
    this.record = cloneUIObservationRecord(record);
  }

  get frameCount(): number {
    return this.record.frames.length;
  }

  get startedAt(): number {
    return this.record.startedAt;
  }

  get endedAt(): number {
    return this.record.endedAt;
  }

  private ensureUsable(): void {
    assert(!this.disposed, 'UI observation has been disposed');
  }

  private ensureFixedWindowOptions(options?: { domIncluded?: unknown }): void {
    assert(
      !(
        this.record.captureMode === 'source' &&
        (this.record.droppedFrames ?? 0) > 0
      ),
      'Cannot run AI insights on an incomplete source observation: frames were dropped after maxFrames. Export the record for review or repeat with a larger maxFrames.',
    );
    assert(
      options?.domIncluded === undefined,
      'UIObservation does not support domIncluded because it only evaluates recorded screenshots',
    );
  }

  async aiQuery<ReturnType = any>(
    demand: ServiceExtractParam,
    options?: ObservationQueryOptions,
  ): Promise<ReturnType> {
    this.ensureUsable();
    this.ensureFixedWindowOptions(options);
    return this.insight.aiQuery<ReturnType>(demand, options);
  }

  async aiBoolean(
    prompt: TUserPrompt,
    options?: ObservationQueryOptions,
  ): Promise<boolean> {
    this.ensureUsable();
    this.ensureFixedWindowOptions(options);
    return this.insight.aiBoolean(prompt, options);
  }

  async aiNumber(
    prompt: TUserPrompt,
    options?: ObservationQueryOptions,
  ): Promise<number> {
    this.ensureUsable();
    this.ensureFixedWindowOptions(options);
    return this.insight.aiNumber(prompt, options);
  }

  async aiString(
    prompt: TUserPrompt,
    options?: ObservationQueryOptions,
  ): Promise<string> {
    this.ensureUsable();
    this.ensureFixedWindowOptions(options);
    return this.insight.aiString(prompt, options);
  }

  async aiAsk(
    prompt: TUserPrompt,
    options?: ObservationQueryOptions,
  ): Promise<string> {
    this.ensureUsable();
    this.ensureFixedWindowOptions(options);
    return this.insight.aiAsk(prompt, options);
  }

  async aiAssert(
    assertion: TUserPrompt,
    message?: string,
    options?: ObservationAssertOptions,
  ): Promise<AgentAssertResult | undefined> {
    this.ensureUsable();
    this.ensureFixedWindowOptions(options);
    return this.insight.aiAssert(assertion, message, options);
  }

  /** Export all retained frames and timing metadata, independently of AI evidence selection. */
  async exportRecord(): Promise<UIObservationRecord> {
    this.ensureUsable();
    return cloneUIObservationRecord(this.record);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposeRecord?.();
    this.disposed = true;
    this.onDisposed?.();
  }
}

function isImageDataUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^data:image\/(?:png|jpe?g);base64,/i.test(value)
  );
}

/**
 * Observe an explicit screen window and produce a fixed UIObservation.
 */
export class UIObserverImpl implements UIObserver {
  private readonly frameBuffer: ObservationFrameBuffer;
  private get frames(): BufferedObservationFrame[] {
    return this.frameBuffer.frames;
  }
  private readonly events: UIObservationEvent[] = [];
  private readonly captureMode: 'sampled' | 'source';
  private unsubscribe?: () => void;
  private readonly clockId =
    `node-monotonic:${process.pid}:${performance.timeOrigin}`;

  recordEvent(event: UIObservationEvent): void {
    assert(
      !this.stopped && !this.disposed,
      'cannot add events to a stopped observation',
    );
    assert(event.name.trim().length > 0, 'observation event name is required');
    this.events.push({
      name: event.name,
      timing: observationTimingSchema.parse(event.timing),
    });
  }

  private source: DeviceFrameSource | null = null;
  private usingFallback = false;
  private stopped = false;
  private disposed = false;
  private loopPromise: Promise<void> | null = null;
  private stopPromise: Promise<UIObservationImpl> | null = null;
  private representative: UIContext | null = null;
  private representativeFrame: UIObservationFrame | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private persistPromise: Promise<void> | null = null;
  private persistedByRef = new Map<unknown, UIObservationFrame>();
  private observation: UIObservationImpl | null = null;
  private startedAt = 0;
  private readonly intervalMs: number;
  private readonly watchdogMs: number;
  private readonly screenshotShrinkFactor: number;
  private readonly writer: UIObservationRecordWriter;

  constructor(
    private readonly deps: UIObserverDeps,
    opt?: UIObserverOption,
  ) {
    this.captureMode = opt?.captureMode ?? 'sampled';
    for (const [name, value] of Object.entries(opt ?? {})) {
      if (
        value !== undefined &&
        ['intervalMs', 'maxFrames', 'watchdogMs'].includes(name)
      ) {
        assert(
          typeof value === 'number' &&
            Number.isFinite(value) &&
            value >= 0 &&
            (name !== 'maxFrames' || Number.isInteger(value)),
          `${name} must be a finite non-negative number (maxFrames must be an integer)`,
        );
      }
    }
    this.intervalMs = Math.max(
      MIN_INTERVAL_MS,
      opt?.intervalMs ?? DEFAULT_INTERVAL_MS,
    );
    this.frameBuffer = new ObservationFrameBuffer(
      this.captureMode,
      Math.max(2, opt?.maxFrames ?? DEFAULT_MAX_FRAMES),
    );
    this.watchdogMs = opt?.watchdogMs ?? DEFAULT_WATCHDOG_MS;
    this.screenshotShrinkFactor =
      this.captureMode === 'source' ? 1 : (deps.screenshotShrinkFactor ?? 1);
    this.writer =
      deps.observationRecordWriter ?? new UIObservationRecordWriter();
  }

  get bufferedFrameCount(): number {
    return this.frames.length;
  }

  async start(): Promise<void> {
    assert(!this.startedAt && !this.stopped, 'observer has already started');
    this.startedAt = Date.now();
    try {
      this.source = (await this.deps.openFrameSource()) ?? null;
    } catch (error) {
      if (this.captureMode === 'source') throw error;
      debug(`frame source unavailable, using screenshot fallback: ${error}`);
      this.source = null;
    }
    if (this.captureMode === 'source' && !this.source?.subscribe) {
      await this.source?.stop();
      throw new Error(
        'Source observation requires a push frame source; screenshot fallback cannot provide native timing',
      );
    }
    this.usingFallback = !this.source;
    if (this.usingFallback) {
      debug('no continuous frame source; sampling via plain screenshots');
    } else {
      const waitStart = performance.now();
      while (
        !this.source!.latest() &&
        performance.now() - waitStart < FIRST_FRAME_TIMEOUT_MS
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!this.source!.latest()) {
        debug(
          `no first frame within ${FIRST_FRAME_TIMEOUT_MS}ms; starting anyway`,
        );
      }
    }
    if (this.captureMode === 'source') {
      const baseline = this.source!.latest();
      if (!baseline) {
        await this.source!.stop();
        throw new Error('Native observation baseline timed out');
      }
      this.pushFrame(baseline);
      this.unsubscribe = this.source!.subscribe!((frame) => {
        if (!this.stopped) this.pushFrame(frame);
      });
    } else {
      await this.captureOnce();
      this.loopPromise = this.runLoop();
    }

    if (this.watchdogMs > 0) {
      this.watchdogTimer = setTimeout(() => {
        warnObserver(
          `UIObserver auto-stopped after ${this.watchdogMs}ms. Call observer.stop() explicitly to avoid this.`,
        );
        this.stop().catch(() => {});
      }, this.watchdogMs);
      if (
        typeof (this.watchdogTimer as { unref?: () => void }).unref ===
        'function'
      ) {
        (this.watchdogTimer as { unref: () => void }).unref();
      }
    }
  }

  stop(): Promise<UIObservationImpl> {
    if (!this.stopPromise) {
      this.stopPromise = this.finalizeStop();
    }
    return this.stopPromise;
  }

  private async finalizeStop(): Promise<UIObservationImpl> {
    this.stopped = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    await this.loopPromise;

    try {
      if (this.captureMode === 'source') this.source!.latest(); // Surface stream failures.
      if (this.frames.length > 0) {
        this.persistPromise = this.persistUnstoredFrames().catch((error) => {
          debug(`frame persistence failed, will retry during export: ${error}`);
        });
      }
      const representativePromise = this.deps.capturePreparedRepresentative();
      const [, preparedRepresentative] = await Promise.all([
        this.persistPromise,
        representativePromise,
      ]);

      let representative = preparedRepresentative;
      const lastFrame = this.frames.at(-1);
      if (this.source && lastFrame?.persisted) {
        this.representativeFrame = {
          ...lastFrame.persisted,
          capturedAt: lastFrame.capturedAt,
        };
        const screenshot = ScreenshotItem.fromFile(
          this.writer.resolveFramePath(lastFrame.persisted),
          lastFrame.persisted.mimeType,
          lastFrame.capturedAt,
          lastFrame.timing,
          lastFrame.frameId,
        );
        const shotSize = await imageInfoOfBase64(screenshot.base64);
        // Source pixels can differ from the separately prepared screenshot (for
        // example when the Agent shrinks screenshots). Preserve the same logical
        // width while replacing the entire image context, without mutating the
        // Agent's cached representative.
        representative = {
          ...preparedRepresentative,
          screenshot,
          shotSize,
          shrunkShotToLogicalRatio:
            (shotSize.width * preparedRepresentative.shrunkShotToLogicalRatio) /
            preparedRepresentative.shotSize.width,
        };
        debug('representative context aligned with last observed frame');
      }
      this.representative = representative;
      const endedAt = Date.now();
      const record = await this.finalizeRecord(endedAt);
      this.observation = new UIObservationImpl(
        record,
        this.deps.createInsight(record),
        () => this.writer.dispose(),
        this.deps.onDisposed,
      );
      return this.observation;
    } finally {
      if (this.source) {
        try {
          await this.source.stop();
        } catch (error) {
          debug(`error stopping frame source: ${error}`);
        }
      }
      debug(
        `observation stopped with ${this.frames.length} buffered frames (+1 representative)`,
      );
      this.deps.onStopped?.();
    }
  }

  private async finalizeRecord(endedAt: number): Promise<UIObservationRecord> {
    assert(
      this.stopped && this.representative,
      'observation must be stopped before finalizing the observed window',
    );
    if (this.persistPromise) {
      await this.persistPromise;
      this.persistPromise = null;
    }
    await this.persistUnstoredFrames();

    const sampledFrames = this.frames.map((frame) => {
      assert(frame.persisted, 'observation frame was not persisted');
      return {
        ...frame.persisted,
        capturedAt: frame.capturedAt,
        ...(frame.frameId ? { frameId: frame.frameId } : {}),
        ...(frame.timing ? { timing: { ...frame.timing } } : {}),
      };
    });

    if (!this.representativeFrame) {
      const representative = this.representative!;
      // The representative UIContext has already been prepared by
      // commonContextParser().
      this.representativeFrame = this.writer.persistFrame(
        representative.screenshot.base64,
        representative.screenshot.capturedAt,
      );
      representative.screenshot = ScreenshotItem.fromFile(
        this.writer.resolveFramePath(this.representativeFrame),
        this.representativeFrame.mimeType,
        this.representativeFrame.capturedAt,
      );
    }

    const frames =
      this.captureMode === 'source'
        ? sampledFrames
        : [...sampledFrames, this.representativeFrame];
    if (frames.length > MAX_FRAMES_PER_RECORD) {
      warnObserver(
        `WARNING: exporting ${frames.length} frames (soft limit ${MAX_FRAMES_PER_RECORD}). Insight analyzes every retained frame and sends at most eight evidence images, but a larger recording increases capture storage and analysis work; consider increasing intervalMs or decreasing maxFrames.`,
      );
    }
    debug(
      `exporting ${frames.length} file-backed observation frames (${this.persistedByRef.size} decoded source refs)`,
    );
    const metadata: UIObservationRecordMetadata = {
      ...(this.events.length
        ? {
            events: this.events.map((event) => ({
              ...event,
              timing: { ...event.timing },
            })),
          }
        : {}),
      captureMode: this.captureMode,
      droppedFrames: this.frameBuffer.droppedFrames,
      startedAt: this.startedAt,
      endedAt,
      shotSize: { ...this.representative!.shotSize },
      shrunkShotToLogicalRatio: this.representative!.shrunkShotToLogicalRatio,
    };
    return this.writer.finalize(frames, metadata);
  }

  /** Release writer-owned image files after the observation is no longer needed. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    try {
      if (this.stopPromise) {
        await this.stopPromise;
      } else if (!this.stopped) {
        await this.stop();
      }
    } finally {
      if (this.observation) {
        await this.observation.dispose();
      } else {
        this.writer.dispose();
        this.deps.onDisposed?.();
      }
      this.frameBuffer.clear();
      this.persistedByRef.clear();
      this.observation = null;
      this.disposed = true;
    }
  }

  private async persistUnstoredFrames(): Promise<void> {
    const uniqueFrames = this.dedupeRefs(
      this.frames.filter((frame) => !frame.persisted),
    );
    const uncachedFrames = uniqueFrames.filter(
      (frame) => !this.persistedByRef.has(frame.ref),
    );

    for (
      let start = 0;
      start < uncachedFrames.length;
      start += DECODE_BATCH_SIZE
    ) {
      const batch = uncachedFrames.slice(start, start + DECODE_BATCH_SIZE);
      const decoded = this.source
        ? await this.source.decode(batch)
        : batch.map((frame) => {
            assert(
              isImageDataUrl(frame.ref),
              'fallback observation frame must be an image data URL',
            );
            return frame.ref;
          });
      assert(
        decoded.length === batch.length,
        'frame source decode() must return one image per frame handle',
      );
      const preparedDataUrls = await Promise.all(
        decoded.map((dataUrl) =>
          this.captureMode === 'source'
            ? dataUrl
            : prepareScreenshotForPersistence(dataUrl, {
                shrinkFactor: this.screenshotShrinkFactor,
              }),
        ),
      );
      for (let index = 0; index < batch.length; index++) {
        this.persistedByRef.set(
          batch[index].ref,
          this.writer.persistFrame(
            preparedDataUrls[index],
            batch[index].capturedAt,
            batch[index].timing,
            batch[index].frameId,
          ),
        );
      }
    }

    for (const frame of this.frames) {
      frame.persisted ??= this.persistedByRef.get(frame.ref);
    }
    if (uncachedFrames.length > 0) {
      debug(`decoded and persisted ${uncachedFrames.length} source frames`);
    }
  }

  private async captureOnce(): Promise<void> {
    try {
      if (this.source) {
        const frame = this.source.latest();
        if (!frame) return;
        if (isImageDataUrl(frame.ref)) {
          const preparedDataUrl = await prepareScreenshotForPersistence(
            frame.ref,
            { shrinkFactor: this.screenshotShrinkFactor },
          );
          const persisted = this.writer.persistFrame(
            preparedDataUrl,
            frame.capturedAt,
            frame.timing,
            frame.frameId,
          );
          this.pushFrame({
            ...frame,
            ref: persisted.path,
            capturedAt: frame.capturedAt,
            persisted,
          });
        } else {
          this.pushFrame(frame);
        }
        return;
      }
      const startMs = performance.now();
      const rawScreenshot = await this.deps.captureRawScreenshot();
      const endMs = performance.now();
      const capturedAt = Date.now();
      const preparedDataUrl = await prepareScreenshotForPersistence(
        rawScreenshot,
        { shrinkFactor: this.screenshotShrinkFactor },
      );
      const persisted = this.writer.persistFrame(preparedDataUrl, capturedAt, {
        clockId: this.clockId,
        startMs,
        endMs,
        kind: 'capture-interval',
      });
      this.pushFrame({
        ref: persisted.path,
        capturedAt: persisted.capturedAt,
        timing: persisted.timing,
        persisted,
      });
    } catch (error) {
      if (this.captureMode === 'source') throw error;
      debug(`frame capture failed, skipping tick: ${error}`);
    }
  }

  private async runLoop(): Promise<void> {
    while (!this.stopped) {
      const tickStart = Date.now();
      await this.captureOnce();
      while (!this.stopped && Date.now() - tickStart < this.intervalMs) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(20, this.intervalMs - (Date.now() - tickStart)),
          ),
        );
      }
    }
  }

  private pushFrame(frame: DeviceFrameRef | BufferedObservationFrame): void {
    if (this.frameBuffer.add(frame) === 'thinned') {
      this.writer.pruneFrames(
        this.frames.flatMap((retainedFrame) =>
          retainedFrame.persisted ? [retainedFrame.persisted] : [],
        ),
      );
      debug(`frame buffer thinned to ${this.frames.length} frames`);
    }
  }

  private dedupeRefs(
    frames: BufferedObservationFrame[],
  ): BufferedObservationFrame[] {
    const seen = new Set<unknown>();
    const result: BufferedObservationFrame[] = [];
    for (const frame of frames) {
      if (!seen.has(frame.ref)) {
        seen.add(frame.ref);
        result.push(frame);
      }
    }
    return result;
  }
}

/** Rebuild model-facing temporal context from resolved image file paths. */
export function uiContextFromObservationRecord(
  record: UIObservationRecord,
): UIContext {
  assert(
    record.type === 'midscene_ui_observation' && record.version === 1,
    'invalid UI observation record type or version',
  );
  assert(record.frames.length > 0, 'UI observation record contains no frames');
  assert(
    Number.isFinite(record.shotSize.width) && record.shotSize.width > 0,
    'UI observation record shot width must be positive',
  );
  assert(
    Number.isFinite(record.shotSize.height) && record.shotSize.height > 0,
    'UI observation record shot height must be positive',
  );
  assert(
    Number.isFinite(record.shrunkShotToLogicalRatio) &&
      record.shrunkShotToLogicalRatio > 0,
    'UI observation record screenshot ratio must be positive',
  );
  const screenshotSequence = record.frames.map((frame) =>
    ScreenshotItem.fromFile(
      frame.path,
      frame.mimeType,
      frame.capturedAt,
      frame.timing,
      frame.frameId,
    ),
  );
  return {
    screenshot: screenshotSequence[screenshotSequence.length - 1],
    screenshotSequence,
    observationTiming: {
      frames: record.frames.map((frame) => frame.timing),
      events: record.events ?? [],
      droppedFrames: record.droppedFrames ?? 0,
    },
    shotSize: { ...record.shotSize },
    shrunkShotToLogicalRatio: record.shrunkShotToLogicalRatio,
  };
}
