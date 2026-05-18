import type { Agent as PageAgent } from '@midscene/core/agent';
import type {
  MjpegStreamFrame,
  MjpegStreamHandle,
} from '@midscene/core/device';
import { type DebugFunction, getDebug } from '@midscene/shared/logger';
import type { Request, Response } from 'express';

const DATA_URL_BASE64_PREFIX = /^data:image\/\w+;base64,/;

const noopDebug: DebugFunction = () => {};

type ActiveInterface = PageAgent['interface'];

type Subscriber = (frame: MjpegStreamFrame) => void;

interface InternalProducer {
  source: ActiveInterface;
  controller: AbortController;
  handle?: MjpegStreamHandle;
  lastFrame?: MjpegStreamFrame;
  startupError?: unknown;
  firstFrameReady: Promise<boolean>;
  subscribers: Set<Subscriber>;
  /** Tracks `res` instances per subscriber so the hub can hard-close them. */
  responses: Map<Subscriber, Response>;
  stopTimer?: ReturnType<typeof setTimeout>;
}

export interface InterfaceMjpegHubOptions {
  /** Time the hub waits for the first producer frame before falling back. */
  initialFrameTimeoutMs: number;
  /** Idle window after the last subscriber leaves before tearing the producer down. */
  idleStopMs: number;
  /** Optional debug logger for hub internals. Defaults to a no-op. */
  debug?: DebugFunction;
}

/**
 * Recovery hook supplied by the server. When the producer fails to start
 * because the underlying page session was closed, the hub asks the server to
 * rebuild the agent and returns the new interface; otherwise the hub gives up
 * and lets `streamRequest` resolve to false.
 */
export type RecoverActiveAgent = (
  error: unknown,
) => Promise<ActiveInterface | null>;

/**
 * Writes one MJPEG part to `res`, preferring backpressure-safe writes.
 *
 * Returns `true` when the chunk has been accepted by the socket buffer and
 * `false` when the kernel buffer is full. Callers SHOULD drop frames or wait
 * for `drain` instead of pushing more data when this returns `false`.
 *
 * `frame.data` may either be raw base64 or a `data:image/...;base64,...` URL;
 * the function strips the prefix defensively. New producers should already
 * normalize to bare base64.
 */
export function writeMjpegFrame(
  res: Response,
  boundary: string,
  frame: MjpegStreamFrame,
): boolean {
  const raw = frame.data.replace(DATA_URL_BASE64_PREFIX, '');
  const buf = Buffer.from(raw, 'base64');

  // Each `res.write` returns false when the kernel buffer is full. We
  // surface the worst result so the caller can react to backpressure on the
  // first chunk that exceeds the high water mark.
  let writable = res.write(`--${boundary}\r\n`);
  writable =
    res.write(`Content-Type: ${frame.contentType || 'image/jpeg'}\r\n`) &&
    writable;
  writable = res.write(`Content-Length: ${buf.length}\r\n\r\n`) && writable;
  writable = res.write(buf) && writable;
  // Trailing boundary delimiter so Chromium <img> commits this part to the
  // display *immediately* instead of waiting for the next frame to confirm.
  // Without this, an idle page (CDP screencast emits no further frames)
  // leaves the just-attached subscriber with `<img>.naturalWidth === 0` and
  // a blank canvas — that's the "white preview after Overview → Device
  // re-entry" symptom. The price is each frame ships a tiny duplicate
  // boundary line; Chromium folds the resulting empty parts away.
  writable = res.write(`\r\n--${boundary}\r\n`) && writable;
  return writable;
}

/**
 * Owns the lifecycle of an in-process MJPEG frame producer (e.g. Chromium
 * CDP `Page.startScreencast`) and fans frames out to all currently connected
 * HTTP MJPEG clients.
 *
 * Why this is its own class:
 * - CDP screencasts are page-scoped, so multiple concurrent producers would
 *   steal frames from each other. Keeping a single producer + N subscribers
 *   here prevents the playground server from accidentally racing against
 *   itself.
 * - Producer creation, idle teardown, recovery after page-session loss and
 *   backpressure handling are all naturally co-located with the producer
 *   state. Moving them out of `PlaygroundServer` keeps that class focused on
 *   HTTP routing.
 */
export class InterfaceMjpegHub {
  private producer?: InternalProducer;
  private readonly debug: DebugFunction;

  constructor(private readonly opts: InterfaceMjpegHubOptions) {
    this.debug = opts.debug ?? noopDebug;
  }

  /**
   * Streams the active interface's MJPEG frames to `res`. Returns true once
   * the response is committed to streaming, false if the interface has no
   * frame producer or the initial frame never arrived.
   */
  async streamRequest(
    req: Request,
    res: Response,
    activeInterface: ActiveInterface,
    recoverActiveAgent: RecoverActiveAgent,
  ): Promise<boolean> {
    return this.streamRequestInternal(
      req,
      res,
      activeInterface,
      recoverActiveAgent,
      true,
    );
  }

  /**
   * Tears down the current producer (used when the server replaces an agent
   * out-of-band, e.g. after a recoverable page-session error during /interact).
   */
  stopProducer(): void {
    this.stopProducerInternal(this.producer);
  }

  /**
   * Best-effort shutdown for server.close(). Aborts any active producer and
   * forcibly closes attached subscriber sockets.
   */
  shutdown(): void {
    const producer = this.producer;
    if (!producer) return;
    for (const [subscriber, res] of producer.responses) {
      producer.subscribers.delete(subscriber);
      try {
        res.destroy();
      } catch {
        /* socket already closed */
      }
    }
    producer.responses.clear();
    this.stopProducerInternal(producer);
  }

  private async streamRequestInternal(
    req: Request,
    res: Response,
    activeInterface: ActiveInterface,
    recoverActiveAgent: RecoverActiveAgent,
    allowRecovery: boolean,
  ): Promise<boolean> {
    const producer = this.getOrCreateProducer(activeInterface);
    if (!producer) return false;

    const hasInitialFrame = await producer.firstFrameReady;
    if (!hasInitialFrame || !producer.lastFrame) {
      this.debug(
        'interface frame producer did not emit an initial frame, falling back to polling',
      );
      const startupError = producer.startupError;
      this.stopProducerInternal(producer);
      if (allowRecovery && startupError) {
        const recoveredInterface = await recoverActiveAgent(startupError);
        if (recoveredInterface) {
          return this.streamRequestInternal(
            req,
            res,
            recoveredInterface,
            recoverActiveAgent,
            false,
          );
        }
      }
      return false;
    }

    this.attachSubscriber(req, res, producer);
    return true;
  }

  private attachSubscriber(
    req: Request,
    res: Response,
    producer: InternalProducer,
  ): void {
    const boundary = 'mjpeg-boundary';
    let closed = false;
    let dropping = false;

    const closeResponse = () => {
      if (closed) return;
      closed = true;
      this.releaseSubscriber(producer, subscriber);
    };

    const subscriber: Subscriber = (frame) => {
      if (closed) return;
      // Drop frames while the socket buffer is full instead of letting the
      // node internal buffer balloon. CDP screencasts can run at 60Hz and a
      // slow client would otherwise OOM the server.
      if (dropping) return;
      try {
        const writable = writeMjpegFrame(res, boundary, frame);
        if (!writable) {
          dropping = true;
          res.once('drain', () => {
            dropping = false;
          });
        }
      } catch (error) {
        this.debug('interface frame write failed: %s', error);
        closeResponse();
        try {
          res.destroy();
        } catch {
          /* socket already closed */
        }
      }
    };

    // Chromium's <img> with multipart/x-mixed-replace keeps the underlying
    // TCP connection alive even after the element is unmounted from the DOM —
    // there's no FIN until something else cleans up. Each subsequent mount
    // (Overview ↔ Device re-entry, React StrictMode double-mount, retry
    // timer) opens a new socket without releasing the old one. Studio only
    // ever has a single visible preview, so before attaching the new
    // subscriber we destroy any stale ones — this both releases server-side
    // resources and unblocks Chromium's per-origin connection slot quota
    // (6 for HTTP/1.1). Without this, after a handful of re-mounts the
    // browser cannot open any further /mjpeg request and shows a permanent
    // blank canvas.
    for (const [oldSubscriber, oldRes] of producer.responses) {
      producer.subscribers.delete(oldSubscriber);
      producer.responses.delete(oldSubscriber);
      try {
        oldRes.destroy();
      } catch {
        /* socket already closed */
      }
    }

    producer.subscribers.add(subscriber);
    producer.responses.set(subscriber, res);
    if (producer.stopTimer) {
      clearTimeout(producer.stopTimer);
      producer.stopTimer = undefined;
    }
    req.on('close', closeResponse);

    res.setHeader(
      'Content-Type',
      `multipart/x-mixed-replace; boundary=${boundary}`,
    );
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    subscriber(producer.lastFrame as MjpegStreamFrame);

    this.debug('streaming via shared interface frame producer');
  }

  private getOrCreateProducer(
    activeInterface: ActiveInterface,
  ): InternalProducer | null {
    const startMjpegStream = activeInterface.startMjpegStream;
    if (typeof startMjpegStream !== 'function') return null;

    if (this.producer?.source === activeInterface) {
      if (this.producer.stopTimer) {
        clearTimeout(this.producer.stopTimer);
        this.producer.stopTimer = undefined;
      }
      return this.producer;
    }

    this.stopProducerInternal(this.producer);

    const controller = new AbortController();
    let resolveInitialFrame: ((hasFrame: boolean) => void) | undefined;
    let initialFrameTimer: ReturnType<typeof setTimeout> | undefined;

    const resolveInitialFrameOnce = (hasFrame: boolean) => {
      if (!resolveInitialFrame) return;
      if (initialFrameTimer) {
        clearTimeout(initialFrameTimer);
        initialFrameTimer = undefined;
      }
      resolveInitialFrame(hasFrame);
      resolveInitialFrame = undefined;
    };

    const initialFrameReady = new Promise<boolean>((resolve) => {
      resolveInitialFrame = resolve;
      initialFrameTimer = setTimeout(() => {
        resolveInitialFrameOnce(false);
      }, this.opts.initialFrameTimeoutMs);
    });

    const producer: InternalProducer = {
      source: activeInterface,
      controller,
      firstFrameReady: initialFrameReady,
      subscribers: new Set(),
      responses: new Map(),
    };
    this.producer = producer;

    void (async () => {
      try {
        producer.handle =
          (await startMjpegStream.call(activeInterface, {
            signal: controller.signal,
            onFrame: (frame) => {
              if (controller.signal.aborted) return;
              producer.lastFrame = frame;
              resolveInitialFrameOnce(true);
              for (const subscriber of producer.subscribers) {
                subscriber(frame);
              }
            },
            onError: (error) => {
              this.debug('interface stream producer error: %s', error);
              // Tear down the dead producer so the next /mjpeg request
              // (triggered by the <img> onError → retry) constructs a
              // fresh one. Without this, the dead producer is reused
              // forever — explaining why even page.reload() can't
              // recover the preview after an in-flight CDP screencast
              // dies during a task run.
              this.stopProducerInternal(producer);
            },
          })) ?? undefined;
      } catch (error) {
        this.debug('interface frame producer unavailable: %s', error);
        producer.startupError = error;
        resolveInitialFrameOnce(false);
        this.stopProducerInternal(producer);
      }
    })();

    return producer;
  }

  private stopProducerInternal(producer?: InternalProducer): void {
    if (!producer) return;
    if (producer.stopTimer) {
      clearTimeout(producer.stopTimer);
      producer.stopTimer = undefined;
    }
    // Hard-close any subscriber sockets we still own so the browser <img>
    // does not hang on a half-open multipart response.
    for (const [, res] of producer.responses) {
      try {
        res.destroy();
      } catch {
        /* socket already closed */
      }
    }
    producer.responses.clear();
    producer.subscribers.clear();
    producer.controller.abort();
    Promise.resolve(producer.handle?.stop?.()).catch((error) => {
      this.debug('interface stream stop failed: %s', error);
    });
    if (this.producer === producer) {
      this.producer = undefined;
    }
  }

  private releaseSubscriber(
    producer: InternalProducer,
    subscriber: Subscriber,
  ): void {
    producer.subscribers.delete(subscriber);
    producer.responses.delete(subscriber);
    if (producer.subscribers.size > 0 || producer.stopTimer) return;
    producer.stopTimer = setTimeout(() => {
      producer.stopTimer = undefined;
      if (producer.subscribers.size === 0) {
        this.stopProducerInternal(producer);
      }
    }, this.opts.idleStopMs);
  }
}

/**
 * Convenience constructor that wires up a debug logger derived from the
 * `web:mjpeg` namespace so server logs are consistent with other modules.
 */
export function createInterfaceMjpegHub(
  opts: Omit<InterfaceMjpegHubOptions, 'debug'> & { debug?: DebugFunction },
): InterfaceMjpegHub {
  return new InterfaceMjpegHub({
    ...opts,
    debug: opts.debug ?? getDebug('playground:mjpeg-hub'),
  });
}
