import { imageInfoOfBase64, resizeImgBase64 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { DeviceFrameRef, DeviceFrameSource } from '../device';
import { ScreenshotItem } from '../screenshot-item';
import type { AgentAssertOpt, ServiceExtractOption, UIContext } from '../types';

const debug = getDebug('ui-observer');
const warnObserver = getDebug('ui-observer', { console: true });

// Guardrails from the performance research: cap sampling at 5fps and bound the
// frame buffer. All buffered frames (up to maxFrames) are sent to the
// model so transient UI in long windows is not missed by down-sampling.
const DEFAULT_INTERVAL_MS = 1000;
const MIN_INTERVAL_MS = 200;
const DEFAULT_MAX_FRAMES = 30;
// How long start() waits for a cold stream's first frame before proceeding.
const FIRST_FRAME_TIMEOUT_MS = 3000;
// Default watchdog: auto-stop an observer that was never explicitly stopped.
const DEFAULT_WATCHDOG_MS = 5 * 60 * 1000;
// Soft cap on frames sent to the model per assertion. We still send all frames
// (no silent dropping), but warn the user when this is exceeded.
const MAX_FRAMES_TO_MODEL = 50;

export interface UIObserverOption {
  /** Sampling interval between frames in ms. Default 1000, min 200 (5fps). */
  intervalMs?: number;
  /**
   * Maximum number of frames to keep in the buffer. When full the buffer is
   * thinned (change-point frames preserved, static intervals halved) so the
   * whole window keeps temporal coverage. Default 30.
   */
  maxFrames?: number;
  /**
   * Auto-stop the observer after this many ms if stop() was never called.
   * Prevents resource leaks from forgotten observers. Default 5min. Set 0 to
   * disable.
   */
  watchdogMs?: number;
}

interface UIObserverDeps {
  /**
   * Open the device's continuous frame source, if it has one. The observer
   * falls back to plain screenshots when this returns undefined or throws.
   */
  openFrameSource: () => Promise<DeviceFrameSource | undefined>;
  /** Fallback single-frame capture (already a data URL). */
  screenshot: () => Promise<string>;
  /** Capture the final full-quality UIContext (used as the representative). */
  captureRepresentative: () => Promise<UIContext>;
  /** Run an assert against a pre-built multi-frame UIContext. */
  runAssert: (
    assertion: string,
    uiContext: UIContext,
    msg?: string,
    opt?: AgentAssertOpt & ServiceExtractOption,
  ) => Promise<
    undefined | { pass: boolean; thought?: string; message?: string }
  >;
  /** Run a boolean query against a pre-built multi-frame UIContext. */
  runBoolean: (
    prompt: string,
    uiContext: UIContext,
    opt?: ServiceExtractOption,
  ) => Promise<boolean>;
  /** Called when stop() completes, so the agent can clear its active-observer reference. */
  onStopped?: () => void;
  /** Screenshot shrink factor applied to fallback frames. Default 1 (no shrink). */
  screenshotShrinkFactor?: number;
}

/**
 * Observes the screen over an explicit window so a later assertion can judge
 * everything that happened while other agent calls ran — including transient
 * UI that appears mid-action:
 *
 * ```ts
 * const observer = await agent.startObserving();
 * await agent.aiAct('submit the form');
 * await observer.stop();
 * await observer.aiAssert('a success toast appeared during the process');
 * ```
 *
 * Sampling is deliberately cheap: when the device exposes a continuous frame
 * source (scrcpy on Android, WDA MJPEG on iOS, CDP screencast on web), each
 * tick only grabs an opaque frame handle; any decode cost is paid ONCE at the
 * end, for all buffered frames actually sent to the model. Devices without a
 * frame source fall back to plain screenshots per tick. To avoid missing
 * short-lived transient UI in long observation windows, every buffered frame
 * is sent to the model — control cost via `intervalMs` and `maxFrames`.
 */
export class UIObserver {
  private frames: DeviceFrameRef[] = [];
  private source: DeviceFrameSource | null = null;
  private usingFallback = false;
  private stopped = false;
  private loopPromise: Promise<void> | null = null;
  private representative: UIContext | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  /** Cross-assertion decode cache: keyed by frame.ref, avoids re-decoding on Android. */
  private decodedCache = new Map<unknown, string>();
  /** Background pre-decode started in stop(), awaited by buildObservedUIContext(). */
  private preDecodePromise: Promise<void> | null = null;
  private readonly intervalMs: number;
  private readonly maxFrames: number;
  private readonly watchdogMs: number;
  private readonly screenshotShrinkFactor: number;

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
  }

  /** Number of frames currently buffered. */
  get frameCount(): number {
    return this.frames.length;
  }

  /**
   * Open the frame source (or arm the screenshot fallback), capture the first
   * baseline frame, then start the background sampling loop. Awaiting this
   * guarantees at least one pre-action frame exists.
   */
  async start(): Promise<void> {
    assert(!this.loopPromise && !this.stopped, 'observer has already started');
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
      // A freshly opened stream may not have produced a frame yet. Wait
      // briefly so the "one baseline frame before your next action" guarantee
      // holds even on cold streams; if none arrives, continue — frames will
      // land on later ticks.
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

    // Watchdog: auto-stop if the user forgets to call stop().
    if (this.watchdogMs > 0) {
      this.watchdogTimer = setTimeout(() => {
        warnObserver(
          `UIObserver auto-stopped after ${this.watchdogMs}ms. Call observer.stop() explicitly to avoid this.`,
        );
        debug(`watchdog fired after ${this.watchdogMs}ms, auto-stopping`);
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

  /**
   * Stop sampling, kick off background pre-decode, capture the representative,
   * and release the frame source. Guarantees that the frame source is released
   * and the agent's active-observer reference is cleared even if intermediate
   * steps (pre-decode, representative capture) throw.
   */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    // Clear the watchdog.
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    await this.loopPromise;

    try {
      // Kick off pre-decode in the background so aiAssert() doesn't have to
      // wait for decode at call time. This runs concurrently with
      // captureRepresentative().
      if (this.source && this.frames.length > 0) {
        const uniqueRefs = this.dedupeRefs(this.frames);
        this.preDecodePromise = this.source
          .decode(uniqueRefs)
          .then(async (results) => {
            const shrunk = await this.shrinkAllIfNeeded(results);
            uniqueRefs.forEach((ref, i) => {
              this.decodedCache.set(ref.ref, shrunk[i]);
            });
            debug(`pre-decoded ${uniqueRefs.length} frames`);
          })
          .catch((error) => {
            debug(`pre-decode failed, will retry at assert time: ${error}`);
          });
      }

      // Capture representative (DOM, viewport, etc.) — runs in parallel with
      // pre-decode when possible.
      const representativePromise = this.deps.captureRepresentative();

      const [, representative] = await Promise.all([
        this.preDecodePromise,
        representativePromise,
      ]);

      // Temporal alignment: if the last sampled frame is already decoded, use
      // its image as the representative screenshot so the sequence tail is
      // consistent with what was actually on screen during sampling.
      if (this.source && this.frames.length > 0) {
        const lastFrame = this.frames[this.frames.length - 1];
        const lastDecoded = this.decodedCache.get(lastFrame.ref);
        if (lastDecoded) {
          representative.screenshot = ScreenshotItem.create(
            lastDecoded,
            lastFrame.capturedAt,
          );
          debug('representative screenshot aligned with last sampled frame');
        }
      }

      this.representative = representative;
    } finally {
      // Always release the frame source and notify the agent — even if
      // pre-decode or representative capture threw. Keep the source reference
      // so buildObservedUIContext() can still call decode() if pre-decode
      // failed (decode is independent of the stream subscription).
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

      // Notify the agent that this observer is no longer active.
      this.deps.onStopped?.();
    }
  }

  /**
   * Assert against the observed window. All buffered frames (plus the final
   * representative) are decoded and sent to the model. To control cost for
   * long windows, increase `intervalMs` or decrease `maxFrames`.
   * Throws when the assertion fails, mirroring `agent.aiAssert`.
   */
  async aiAssert(
    assertion: string,
    msg?: string,
    opt?: AgentAssertOpt & ServiceExtractOption,
  ): Promise<
    undefined | { pass: boolean; thought?: string; message?: string }
  > {
    const uiContext = await this.buildObservedUIContext();
    return this.deps.runAssert(assertion, uiContext, msg, opt);
  }

  /** Boolean query over the observed window (same frame semantics as aiAssert). */
  async aiBoolean(
    prompt: string,
    opt?: ServiceExtractOption,
  ): Promise<boolean> {
    const uiContext = await this.buildObservedUIContext();
    return this.deps.runBoolean(prompt, uiContext, opt);
  }

  private async buildObservedUIContext(): Promise<UIContext> {
    assert(
      this.stopped && this.representative,
      'call observer.stop() before asserting on the observed window',
    );
    const representative = this.representative!;

    // If pre-decode is still running (e.g. user called aiAssert very quickly
    // after stop), wait for it to complete.
    if (this.preDecodePromise) {
      await this.preDecodePromise;
      this.preDecodePromise = null;
    }

    // Send ALL buffered frames to the model so transient UI in long windows
    // is not missed by down-sampling. Cost is controlled by intervalMs and
    // maxFrames instead. Decode each UNIQUE frame once, using the
    // cross-assertion cache.
    const sampled = this.frames;
    const uniqueRefs = this.dedupeRefs(sampled);

    // Find which unique refs are not yet in the decode cache.
    const uncachedRefs = uniqueRefs.filter(
      (r) => !this.decodedCache.has(r.ref),
    );
    if (uncachedRefs.length > 0) {
      const results = this.source
        ? await this.shrinkAllIfNeeded(await this.source.decode(uncachedRefs))
        : uncachedRefs.map((f) => f.ref as string);
      assert(
        results.length === uncachedRefs.length,
        'frame source decode() must return one image per frame handle',
      );
      uncachedRefs.forEach((ref, i) => {
        this.decodedCache.set(ref.ref, results[i]);
      });
      debug(
        `decoded ${uncachedRefs.length} new frames (${uniqueRefs.length - uncachedRefs.length} from cache)`,
      );
    }

    // Build the index map for ordered reconstruction.
    const indexByRef = new Map<unknown, number>();
    uniqueRefs.forEach((ref, i) => indexByRef.set(ref.ref, i));

    // Reconstruct the full ordered sequence from the cache.
    const sequence = sampled.map((frame) =>
      ScreenshotItem.create(
        this.decodedCache.get(frame.ref)!,
        frame.capturedAt,
      ),
    );

    const totalFrames = sequence.length + 1; // +1 for representative
    if (totalFrames > MAX_FRAMES_TO_MODEL) {
      warnObserver(
        `WARNING: sending ${totalFrames} frames to the model (soft limit ${MAX_FRAMES_TO_MODEL}). Consider increasing intervalMs or decreasing maxFrames to reduce token cost.`,
      );
    }

    debug(
      `observed context: ${sequence.length}+1 frames ` +
        `(buffered: ${this.frames.length}, unique: ${uniqueRefs.length}, ` +
        `newly decoded: ${uncachedRefs.length})`,
    );
    return {
      ...representative,
      screenshotSequence: [...sequence, representative.screenshot],
    };
  }

  private async captureOnce(): Promise<void> {
    try {
      if (this.source) {
        const frame = this.source.latest();
        if (frame) this.pushFrame(frame);
        return;
      }
      let base64 = await this.deps.screenshot();
      // Apply shrink factor to fallback screenshots so they match the
      // representative frame size and don't inflate token cost.
      if (this.screenshotShrinkFactor > 1) {
        const { width, height } = await imageInfoOfBase64(base64);
        base64 = await resizeImgBase64(base64, {
          width: Math.round(width / this.screenshotShrinkFactor),
          height: Math.round(height / this.screenshotShrinkFactor),
        });
      }
      this.pushFrame({ ref: base64, capturedAt: Date.now() });
    } catch (error) {
      debug(`frame capture failed, skipping tick: ${error}`);
    }
  }

  /**
   * Apply screenshotShrinkFactor to an array of decoded base64 images in
   * parallel. Returns the input unchanged when shrink factor is 1. Source
   * frames come at device-native resolution; shrinking them matches the
   * representative frame size so the sequence sent to the model has
   * consistent resolution and token cost.
   */
  private async shrinkAllIfNeeded(base64s: string[]): Promise<string[]> {
    if (this.screenshotShrinkFactor <= 1) return base64s;
    const factor = this.screenshotShrinkFactor;
    return Promise.all(
      base64s.map(async (b64) => {
        const { width, height } = await imageInfoOfBase64(b64);
        return resizeImgBase64(b64, {
          width: Math.round(width / factor),
          height: Math.round(height / factor),
        });
      }),
    );
  }

  private async runLoop(): Promise<void> {
    while (!this.stopped) {
      const tickStart = Date.now();
      await this.captureOnce();
      // Sleep out the remainder of the interval in short slices so stop()
      // takes effect promptly.
      while (!this.stopped && Date.now() - tickStart < this.intervalMs) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }

  private pushFrame(frame: DeviceFrameRef): void {
    if (this.frames.length >= this.maxFrames) {
      this.frames = this.thinBuffer(this.frames);
      debug(`frame buffer thinned to ${this.frames.length} frames`);
    }
    this.frames.push(frame);
  }

  /**
   * Smart thinning: preserve all "change point" frames — frames where the
   * screen content differs from the previous frame (detected by ref identity).
   * Between change points, keep every other static frame so temporal coverage
   * is maintained without bloating the buffer. This ensures a brief toast
   * that produces a new keyframe is never thinned out.
   *
   * If smart thinning alone cannot reduce below maxFrames (e.g. the
   * screen is constantly changing and every frame is a change point), a
   * second pass of uniform sampling enforces the hard cap while keeping
   * temporal coverage.
   */
  private thinBuffer(frames: DeviceFrameRef[]): DeviceFrameRef[] {
    if (frames.length <= 1) return frames;

    // Step 1: identify change points.
    const isChangePoint = new Array(frames.length).fill(false);
    isChangePoint[0] = true; // always keep the first frame
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].ref !== frames[i - 1].ref) {
        isChangePoint[i] = true;
      }
    }
    // Always keep the last frame too (closest to when stop() fires).
    isChangePoint[frames.length - 1] = true;

    // Step 2: keep change points plus every other static frame.
    let result: DeviceFrameRef[] = [];
    let staticCounter = 0;
    for (let i = 0; i < frames.length; i++) {
      if (isChangePoint[i]) {
        result.push(frames[i]);
        staticCounter = 0;
      } else if (staticCounter % 2 === 0) {
        result.push(frames[i]);
        staticCounter++;
      } else {
        staticCounter++;
      }
    }

    // Step 3: hard cap — if still over maxFrames, uniformly sample
    // down to the limit. This handles the all-change-points case (animation,
    // video, scrolling) where Step 2 is effectively a no-op.
    if (result.length > this.maxFrames) {
      const step = result.length / this.maxFrames;
      const sampled: DeviceFrameRef[] = [];
      for (let i = 0; i < this.maxFrames; i++) {
        sampled.push(result[Math.floor(i * step)]);
      }
      // Always keep the last frame — it's the closest to stop().
      sampled[this.maxFrames - 1] = result[result.length - 1];
      debug(
        `hard cap: uniformly sampled ${this.maxFrames} frames from ${result.length} change-point frames`,
      );
      result = sampled;
    }

    return result;
  }

  /** Deduplicate frame refs by identity, preserving first-seen order. */
  private dedupeRefs(frames: DeviceFrameRef[]): DeviceFrameRef[] {
    const seen = new Set<unknown>();
    const result: DeviceFrameRef[] = [];
    for (const frame of frames) {
      if (!seen.has(frame.ref)) {
        seen.add(frame.ref);
        result.push(frame);
      }
    }
    return result;
  }
}
