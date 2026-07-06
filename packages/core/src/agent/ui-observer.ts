import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { DeviceFrameRef, DeviceFrameSource } from '../device';
import { ScreenshotItem } from '../screenshot-item';
import type { AgentAssertOpt, ServiceExtractOption, UIContext } from '../types';

const debug = getDebug('ui-observer');

// Guardrails from the performance research: cap sampling at 5fps and bound the
// frame buffer. All buffered frames (up to maxBufferedFrames) are sent to the
// model so transient UI in long windows is not missed by down-sampling.
const DEFAULT_INTERVAL_MS = 1000;
const MIN_INTERVAL_MS = 200;
const DEFAULT_MAX_BUFFERED_FRAMES = 30;
// How long start() waits for a cold stream's first frame before proceeding.
const FIRST_FRAME_TIMEOUT_MS = 3000;

export interface UIObserverOption {
  /** Sampling interval between frames in ms. Default 1000, min 200 (5fps). */
  intervalMs?: number;
  /**
   * Frame-buffer cap. When full the buffer is thinned (every other frame is
   * dropped) so the whole window keeps temporal coverage. Default 30.
   */
  maxBufferedFrames?: number;
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
  ) => Promise<void>;
  /** Run a boolean query against a pre-built multi-frame UIContext. */
  runBoolean: (
    prompt: string,
    uiContext: UIContext,
    opt?: ServiceExtractOption,
  ) => Promise<boolean>;
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
 * is sent to the model — control cost via `intervalMs` and `maxBufferedFrames`.
 */
export class UIObserver {
  private frames: DeviceFrameRef[] = [];
  private source: DeviceFrameSource | null = null;
  private usingFallback = false;
  private stopped = false;
  private loopPromise: Promise<void> | null = null;
  private representative: UIContext | null = null;
  private readonly intervalMs: number;
  private readonly maxBufferedFrames: number;

  constructor(
    private readonly deps: UIObserverDeps,
    opt?: UIObserverOption,
  ) {
    this.intervalMs = Math.max(
      MIN_INTERVAL_MS,
      opt?.intervalMs ?? DEFAULT_INTERVAL_MS,
    );
    this.maxBufferedFrames = Math.max(
      2,
      opt?.maxBufferedFrames ?? DEFAULT_MAX_BUFFERED_FRAMES,
    );
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
  }

  /** Stop sampling, release the frame source, capture the representative. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    await this.loopPromise;
    this.representative = await this.deps.captureRepresentative();
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
  }

  /**
   * Assert against the observed window. All buffered frames (plus the final
   * representative) are decoded and sent to the model with any-frame
   * ("appears in ANY frame") event semantics. To control cost for long
   * windows, increase `intervalMs` or decrease `maxBufferedFrames`.
   * Throws when the assertion fails, mirroring `agent.aiAssert`.
   */
  async aiAssert(
    assertion: string,
    msg?: string,
    opt?: AgentAssertOpt & ServiceExtractOption,
  ): Promise<void> {
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

    // Send ALL buffered frames to the model so transient UI in long windows
    // is not missed by down-sampling. Cost is controlled by intervalMs and
    // maxBufferedFrames instead. Decode each UNIQUE frame once.
    const sampled = this.frames;
    const uniqueRefs: DeviceFrameRef[] = [];
    const indexByRef = new Map<unknown, number>();
    for (const frame of sampled) {
      if (!indexByRef.has(frame.ref)) {
        indexByRef.set(frame.ref, uniqueRefs.length);
        uniqueRefs.push(frame);
      }
    }
    const decoded = this.source
      ? await this.source.decode(uniqueRefs)
      : uniqueRefs.map((f) => f.ref as string);
    assert(
      decoded.length === uniqueRefs.length,
      'frame source decode() must return one image per frame handle',
    );

    const sequence = sampled.map((frame) =>
      ScreenshotItem.create(
        decoded[indexByRef.get(frame.ref)!],
        frame.capturedAt,
      ),
    );
    debug(
      `observed context: ${sequence.length}+1 frames (buffered: ${this.frames.length}, decoded: ${uniqueRefs.length})`,
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
      const base64 = await this.deps.screenshot();
      this.pushFrame({ ref: base64, capturedAt: Date.now() });
    } catch (error) {
      debug(`frame capture failed, skipping tick: ${error}`);
    }
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
    if (this.frames.length >= this.maxBufferedFrames) {
      // Thin instead of dropping the oldest: halving keeps frames spread
      // across the WHOLE window, so early transient UI is not pushed out.
      this.frames = this.frames.filter((_, i) => i % 2 === 0);
      debug(`frame buffer thinned to ${this.frames.length} frames`);
    }
    this.frames.push(frame);
  }
}
