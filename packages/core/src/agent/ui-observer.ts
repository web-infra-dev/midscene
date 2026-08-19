import {
  type UIObservationRecordMetadata,
  UIObservationRecordWriter,
  cloneUIObservationRecord,
} from '@midscene/shared/agent-tools/observation-record';
import type {
  BaseUIObserverOptions,
  UIObservationFrame,
  UIObservationRecord,
} from '@midscene/shared/agent-tools/types';
import {
  convertPngBase64ToJpeg,
  imageInfoOfBase64,
  resizeImgBase64,
} from '@midscene/shared/img';
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

const debug = getDebug('ui-observer');
const warnObserver = getDebug('ui-observer', { console: true });

const DEFAULT_INTERVAL_MS = 1000;
const MIN_INTERVAL_MS = 200;
const DEFAULT_MAX_FRAMES = 30;
const FIRST_FRAME_TIMEOUT_MS = 3000;
const DEFAULT_WATCHDOG_MS = 5 * 60 * 1000;
const MAX_FRAMES_PER_RECORD = 50;
const DECODE_BATCH_SIZE = 4;
const OBSERVATION_JPEG_QUALITY = 90;

/** Options for a UI observation window. */
export type UIObserverOption = BaseUIObserverOptions;

interface UIObserverDeps {
  openFrameSource: () => Promise<DeviceFrameSource | undefined>;
  screenshot: () => Promise<string>;
  captureRepresentative: () => Promise<UIContext>;
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
  /** Release image files owned by this observation. Failed cleanup is retryable. */
  dispose(): Promise<void>;
}

/** Recording lifecycle returned by {@link Agent.startObserving}. */
export interface UIObserver {
  /** Number of frames currently buffered while recording. */
  readonly bufferedFrameCount: number;
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

  /** @internal Used only by the CLI observation artifact adapter. */
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

interface BufferedFrame extends DeviceFrameRef {
  /** Present once the frame no longer needs to retain an in-memory data URL. */
  persisted?: UIObservationFrame;
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
  private frames: BufferedFrame[] = [];
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
  private readonly maxFrames: number;
  private readonly watchdogMs: number;
  private readonly screenshotShrinkFactor: number;
  private readonly writer: UIObservationRecordWriter;

  constructor(
    private readonly deps: UIObserverDeps,
    opt?: UIObserverOption,
  ) {
    this.intervalMs = Math.max(
      MIN_INTERVAL_MS,
      opt?.intervalMs ?? DEFAULT_INTERVAL_MS,
    );
    this.maxFrames = Math.max(2, opt?.maxFrames ?? DEFAULT_MAX_FRAMES);
    this.watchdogMs = opt?.watchdogMs ?? DEFAULT_WATCHDOG_MS;
    this.screenshotShrinkFactor = deps.screenshotShrinkFactor ?? 1;
    this.writer =
      deps.observationRecordWriter ?? new UIObservationRecordWriter();
  }

  get bufferedFrameCount(): number {
    return this.frames.length;
  }

  async start(): Promise<void> {
    assert(!this.loopPromise && !this.stopped, 'observer has already started');
    this.startedAt = Date.now();
    try {
      this.source = (await this.deps.openFrameSource()) ?? null;
    } catch (error) {
      debug(`frame source unavailable, using screenshot fallback: ${error}`);
      this.source = null;
    }
    this.usingFallback = !this.source;
    if (this.usingFallback) {
      debug('no continuous frame source; sampling via plain screenshots');
    } else {
      const waitStart = Date.now();
      while (
        !this.source!.latest() &&
        Date.now() - waitStart < FIRST_FRAME_TIMEOUT_MS
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!this.source!.latest()) {
        debug(
          `no first frame within ${FIRST_FRAME_TIMEOUT_MS}ms; starting anyway`,
        );
      }
    }
    await this.captureOnce();
    this.loopPromise = this.runLoop();

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
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    await this.loopPromise;

    try {
      if (this.frames.length > 0) {
        this.persistPromise = this.persistUnstoredFrames().catch((error) => {
          debug(`frame persistence failed, will retry during export: ${error}`);
        });
      }
      const representativePromise = this.deps.captureRepresentative();
      const [, representative] = await Promise.all([
        this.persistPromise,
        representativePromise,
      ]);

      const lastFrame = this.frames.at(-1);
      if (this.source && lastFrame?.persisted) {
        this.representativeFrame = {
          ...lastFrame.persisted,
          capturedAt: lastFrame.capturedAt,
        };
        representative.screenshot = ScreenshotItem.fromFile(
          this.writer.resolveFramePath(lastFrame.persisted),
          lastFrame.persisted.mimeType,
          lastFrame.capturedAt,
        );
        debug('representative screenshot aligned with last sampled frame');
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
      return { ...frame.persisted, capturedAt: frame.capturedAt };
    });

    if (!this.representativeFrame) {
      const representative = this.representative!;
      // captureRepresentative returns a UIContext whose screenshot has already
      // been shrunk and normalized by commonContextParser().
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

    const frames = [...sampledFrames, this.representativeFrame];
    if (frames.length > MAX_FRAMES_PER_RECORD) {
      warnObserver(
        `WARNING: exporting ${frames.length} frames (soft limit ${MAX_FRAMES_PER_RECORD}). Running insight against this observation sends every frame to the model; consider increasing intervalMs or decreasing maxFrames to reduce token cost.`,
      );
    }
    debug(
      `exporting ${frames.length} file-backed observation frames (${this.persistedByRef.size} decoded source refs)`,
    );
    const metadata: UIObservationRecordMetadata = {
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
      this.frames = [];
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
        decoded.map((dataUrl) => this.prepareFrameForPersistence(dataUrl)),
      );
      for (let index = 0; index < batch.length; index++) {
        this.persistedByRef.set(
          batch[index].ref,
          this.writer.persistFrame(
            preparedDataUrls[index],
            batch[index].capturedAt,
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
          const dataUrl = await this.prepareFrameForPersistence(frame.ref);
          const persisted = this.writer.persistFrame(dataUrl, frame.capturedAt);
          this.pushFrame({
            ref: persisted.path,
            capturedAt: frame.capturedAt,
            persisted,
          });
        } else {
          this.pushFrame(frame);
        }
        return;
      }
      const dataUrl = await this.prepareFrameForPersistence(
        await this.deps.screenshot(),
      );
      const persisted = this.writer.persistFrame(dataUrl, Date.now());
      this.pushFrame({
        ref: persisted.path,
        capturedAt: persisted.capturedAt,
        persisted,
      });
    } catch (error) {
      debug(`frame capture failed, skipping tick: ${error}`);
    }
  }

  private async prepareFrameForPersistence(dataUrl: string): Promise<string> {
    let preparedDataUrl = dataUrl;
    if (this.screenshotShrinkFactor > 1) {
      const { width, height } = await imageInfoOfBase64(dataUrl);
      preparedDataUrl = await resizeImgBase64(dataUrl, {
        width: Math.round(width / this.screenshotShrinkFactor),
        height: Math.round(height / this.screenshotShrinkFactor),
      });
    }

    return convertPngBase64ToJpeg(preparedDataUrl, OBSERVATION_JPEG_QUALITY);
  }

  private async runLoop(): Promise<void> {
    while (!this.stopped) {
      const tickStart = Date.now();
      await this.captureOnce();
      while (!this.stopped && Date.now() - tickStart < this.intervalMs) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }

  private pushFrame(frame: DeviceFrameRef | BufferedFrame): void {
    this.frames.push(frame);
    if (this.frames.length > this.maxFrames) {
      this.frames = this.thinBuffer(this.frames);
      this.writer.pruneFrames(
        this.frames.flatMap((retainedFrame) =>
          retainedFrame.persisted ? [retainedFrame.persisted] : [],
        ),
      );
      debug(`frame buffer thinned to ${this.frames.length} frames`);
    }
  }

  private thinBuffer(frames: BufferedFrame[]): BufferedFrame[] {
    if (frames.length <= 1) return frames;
    const isChangePoint = new Array(frames.length).fill(false);
    isChangePoint[0] = true;
    for (let index = 1; index < frames.length; index++) {
      if (frames[index].ref !== frames[index - 1].ref) {
        isChangePoint[index] = true;
      }
    }
    isChangePoint[frames.length - 1] = true;

    let result: BufferedFrame[] = [];
    let staticCounter = 0;
    for (let index = 0; index < frames.length; index++) {
      if (isChangePoint[index]) {
        result.push(frames[index]);
        staticCounter = 0;
      } else if (staticCounter % 2 === 0) {
        result.push(frames[index]);
        staticCounter++;
      } else {
        staticCounter++;
      }
    }

    if (result.length > this.maxFrames) {
      const step = result.length / this.maxFrames;
      const sampled: BufferedFrame[] = [];
      for (let index = 0; index < this.maxFrames; index++) {
        sampled.push(result[Math.floor(index * step)]);
      }
      sampled[this.maxFrames - 1] = result[result.length - 1];
      result = sampled;
    }
    return result;
  }

  private dedupeRefs(frames: BufferedFrame[]): BufferedFrame[] {
    const seen = new Set<unknown>();
    const result: BufferedFrame[] = [];
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
    ScreenshotItem.fromFile(frame.path, frame.mimeType, frame.capturedAt),
  );
  return {
    screenshot: screenshotSequence[screenshotSequence.length - 1],
    screenshotSequence,
    shotSize: { ...record.shotSize },
    shrunkShotToLogicalRatio: record.shrunkShotToLogicalRatio,
  };
}
