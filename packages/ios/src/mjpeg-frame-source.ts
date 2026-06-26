import { getDebug } from '@midscene/shared/logger';

const debug = getDebug('ios:mjpeg');

// JPEG markers.
const SOI_0 = 0xff;
const SOI_1 = 0xd8;
const EOI_1 = 0xd9;

export interface ExtractedFrames {
  /** Complete JPEG frames found in the buffer, in order. */
  frames: Buffer[];
  /** Bytes after the last complete frame, to be prepended to the next chunk. */
  rest: Buffer;
}

/**
 * Extract complete JPEG frames from a (possibly partial) MJPEG byte buffer by
 * scanning for SOI (`FF D8`) / EOI (`FF D9`) markers. Boundary headers between
 * parts are ignored — anything before the first SOI is discarded. The trailing
 * incomplete bytes are returned as `rest` so they can be prepended to the next
 * chunk.
 */
export function extractJpegFrames(buffer: Buffer): ExtractedFrames {
  const frames: Buffer[] = [];
  let searchStart = 0;

  while (true) {
    // Find the next SOI marker.
    let soi = -1;
    for (let i = searchStart; i + 1 < buffer.length; i++) {
      if (buffer[i] === SOI_0 && buffer[i + 1] === SOI_1) {
        soi = i;
        break;
      }
    }
    if (soi === -1) {
      // No start marker in the unconsumed region. Discard boundary/garbage, but
      // keep a trailing 0xFF that might be the first half of a split SOI marker.
      const last = buffer.length - 1;
      const rest =
        last >= searchStart && buffer[last] === SOI_0
          ? buffer.subarray(last)
          : Buffer.alloc(0);
      return { frames, rest };
    }

    // Find the matching EOI marker after the SOI.
    let eoi = -1;
    for (let i = soi + 2; i + 1 < buffer.length; i++) {
      if (buffer[i] === SOI_0 && buffer[i + 1] === EOI_1) {
        eoi = i;
        break;
      }
    }
    if (eoi === -1) {
      // Incomplete frame; carry everything from the SOI forward.
      return { frames, rest: buffer.subarray(soi) };
    }

    frames.push(buffer.subarray(soi, eoi + 2));
    searchStart = eoi + 2;
  }
}

interface LatestFrame {
  /** JPEG data URL. */
  base64: string;
  capturedAt: number;
}

/**
 * Subscribes to a WDA MJPEG server and keeps the most recently decoded JPEG
 * frame. Pulling the latest frame is near-instant, which lets `frameSequence`
 * sample at the requested cadence instead of paying WDA's slow per-screenshot
 * cost. Lazily connected; auto-reconnects on stream errors until stopped.
 */
export class MjpegFrameSource {
  private latest: LatestFrame | null = null;
  private abortController: AbortController | null = null;
  private runPromise: Promise<void> | null = null;
  private stopped = false;
  private readonly nowFn: () => number;

  constructor(
    private readonly url: string,
    nowFn: () => number = Date.now,
  ) {
    this.nowFn = nowFn;
  }

  /**
   * Ensure the stream is connected and at least one frame has arrived.
   * Resolves once a frame is available, or rejects on timeout.
   */
  async ensureStarted(timeoutMs = 3000): Promise<void> {
    if (this.stopped) {
      throw new Error('MjpegFrameSource has been stopped');
    }
    if (!this.runPromise) {
      this.abortController = new AbortController();
      this.runPromise = this.run(this.abortController.signal);
    }
    if (this.latest) {
      return;
    }
    const start = this.nowFn();
    // Poll for the first frame.
    while (this.nowFn() - start < timeoutMs) {
      if (this.latest) return;
      if (this.stopped) throw new Error('MjpegFrameSource has been stopped');
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error(
      `MjpegFrameSource: no frame received from ${this.url} within ${timeoutMs}ms`,
    );
  }

  /** Latest decoded frame as a JPEG data URL, or null if none yet. */
  getLatest(): { base64: string; capturedAt: number } | null {
    if (!this.latest) return null;
    return { base64: this.latest.base64, capturedAt: this.latest.capturedAt };
  }

  stop(): void {
    this.stopped = true;
    this.abortController?.abort();
    this.abortController = null;
    this.runPromise = null;
    this.latest = null;
  }

  private async run(signal: AbortSignal): Promise<void> {
    while (!this.stopped && !signal.aborted) {
      try {
        const response = await fetch(this.url, { signal });
        if (!response.ok || !response.body) {
          throw new Error(`MJPEG stream responded with ${response.status}`);
        }
        let pending: Buffer = Buffer.alloc(0);
        // response.body is a WHATWG ReadableStream in Node 18+.
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          if (this.stopped || signal.aborted) break;
          pending = Buffer.concat([pending, Buffer.from(chunk)]);
          const { frames, rest } = extractJpegFrames(pending);
          if (frames.length > 0) {
            this.latest = {
              base64: `data:image/jpeg;base64,${frames[frames.length - 1].toString('base64')}`,
              capturedAt: this.nowFn(),
            };
          }
          pending = rest;
          // Guard against unbounded growth if markers never match.
          if (pending.length > 8 * 1024 * 1024) {
            pending = pending.subarray(pending.length - 1024);
          }
        }
      } catch (error) {
        if (this.stopped || signal.aborted) return;
        debug('MJPEG stream error, will retry: %s', error);
      }
      // Back off before reconnecting, whether the stream errored or ended
      // cleanly, so a short-lived connection cannot busy-spin reconnects.
      if (!this.stopped && !signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
}
