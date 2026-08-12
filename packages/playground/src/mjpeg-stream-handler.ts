import http from 'node:http';
import type { Agent as PageAgent } from '@midscene/core/agent';
import type { DeviceFrameRef, DeviceFrameSource } from '@midscene/core/device';
import { getDebug } from '@midscene/shared/logger';
import type { Request, Response } from 'express';
import {
  type InterfaceMjpegFrameLease,
  type InterfaceMjpegHub,
  createInterfaceMjpegHub,
  writeMjpegFrame,
} from './mjpeg-hub';

const debugMjpeg = getDebug('playground:mjpeg', { console: true });

const NEGATIVE_CACHE_MS = 10_000;
const NATIVE_PROBE_INTERVAL_MS = 3000;
const INTERFACE_MJPEG_INITIAL_FRAME_TIMEOUT_MS = 1500;
const INTERFACE_MJPEG_IDLE_STOP_MS = 2000;

const DEFAULT_FPS = 10;
const MAX_FPS = 30;
const MAX_ERROR_BACKOFF_MS = 3000;
const ERROR_LOG_THRESHOLD = 3;

type ActiveInterface = PageAgent['interface'];

export interface RecorderFrameSnapshot {
  screenshot: string;
  capturedAt: number;
  frameToken: string;
  source: 'shared-frame-stream' | 'screenshot-fallback';
}

export interface RecorderFrameLease {
  latest(): Promise<RecorderFrameSnapshot | undefined>;
  waitForFrameAfter(
    capturedAt: number,
    timeoutMs: number,
  ): Promise<RecorderFrameSnapshot | undefined>;
  release(): void;
}

interface DeviceFrameSourceLeaseState {
  activeInterface: ActiveInterface;
  source: DeviceFrameSource;
  leaseCount: number;
  stopTimer?: ReturnType<typeof setTimeout>;
  lastOpaqueRef?: unknown;
  lastCapturedAt?: number;
  lastFrameToken?: string;
  decoded?: {
    opaqueRef: unknown;
    capturedAt: number;
    snapshot: Promise<RecorderFrameSnapshot | undefined>;
  };
}

function toMjpegFrameDataUrl(data: string, contentType?: string) {
  if (data.startsWith('data:')) {
    return data;
  }
  return `data:${contentType || 'image/jpeg'};base64,${data}`;
}

/**
 * Inputs the handler reads on every request, late-bound through callbacks
 * so a single handler instance can survive across device reconnects without
 * the server having to swap it.
 */
export interface MjpegStreamSource {
  /** Native MJPEG URL of the current device, or undefined if it has none. */
  getNativeUrl(): string | undefined;
  /** Active interface, used for in-process MJPEG producers such as CDP screencast. */
  getActiveInterface(): ActiveInterface | null;
  /** Polling fallback. Throws if no agent is connected. */
  takeScreenshot(): Promise<string>;
  /** Returns true when polling fallback can capture screenshots. */
  canTakeScreenshot(): boolean;
  /** Returns false while the agent is being recreated. */
  isAgentReady(): boolean;
  /** Optional recovery hook for page-session loss during preview streaming. */
  recoverFromPreviewError?(
    error: unknown,
    reason: string,
  ): Promise<ActiveInterface | null>;
}

/**
 * Owns all of the MJPEG streaming logic that used to live inline on
 * `PlaygroundServer`:
 *   - Tries the device's native MJPEG URL (e.g. WDA's `iproxy 9100`).
 *   - Caches a negative probe for {@link NEGATIVE_CACHE_MS} so a transient
 *     unavailable WDA does not lock us into polling forever.
 *   - Falls back to polling `screenshotBase64()` and emitting multipart frames.
 *   - While polling, periodically re-probes the native URL and tears down
 *     the polling socket the moment native comes back, so the client
 *     `<img>` reconnects onto the native stream.
 *
 * State lives on the handler instance, so callers can `reset()` on device
 * reconnect to drop the cached probe result.
 */
export class MjpegStreamHandler {
  private nativeAvailable: boolean | null = null;
  private nativeFailedAt: number | null = null;
  private lastPollingFrame?: RecorderFrameSnapshot;
  private deviceFrameSourceLeaseState?: DeviceFrameSourceLeaseState;
  private deviceFrameSourceOpening?: {
    activeInterface: ActiveInterface;
    generation: number;
    promise: Promise<DeviceFrameSourceLeaseState | undefined>;
  };
  private deviceFrameSourceGeneration = 0;
  private deviceFrameTokenSequence = 0;
  private readonly interfaceMjpegHub: InterfaceMjpegHub =
    createInterfaceMjpegHub({
      initialFrameTimeoutMs: INTERFACE_MJPEG_INITIAL_FRAME_TIMEOUT_MS,
      idleStopMs: INTERFACE_MJPEG_IDLE_STOP_MS,
      debug: debugMjpeg,
    });

  constructor(private readonly source: MjpegStreamSource) {}

  /** Drop the cached probe result — call this when the agent reconnects. */
  reset(): void {
    this.nativeAvailable = null;
    this.nativeFailedAt = null;
    this.lastPollingFrame = undefined;
    this.interfaceMjpegHub.stopProducer();
    this.invalidateDeviceFrameSource();
  }

  shutdown(): void {
    this.interfaceMjpegHub.shutdown();
    this.invalidateDeviceFrameSource();
  }

  getLastFrameBase64(): string | undefined {
    return this.getLastFrameSnapshot()?.screenshot;
  }

  getLastFrameSnapshot(): RecorderFrameSnapshot | undefined {
    const interfaceFrame = this.interfaceMjpegHub.getLastFrame();
    if (interfaceFrame) {
      return {
        screenshot: toMjpegFrameDataUrl(
          interfaceFrame.data,
          interfaceFrame.contentType,
        ),
        capturedAt: interfaceFrame.capturedAt,
        frameToken: interfaceFrame.frameToken,
        source: 'shared-frame-stream',
      };
    }
    return this.lastPollingFrame;
  }

  async acquireFrameLease(): Promise<RecorderFrameLease | null> {
    const activeInterface = this.source.getActiveInterface();
    if (!activeInterface) return null;
    const lease = this.interfaceMjpegHub.acquireFrameLease(activeInterface);
    if (lease) return this.wrapFrameLease(lease);
    return this.acquireDeviceFrameSourceLease(activeInterface);
  }

  private wrapFrameLease(lease: InterfaceMjpegFrameLease): RecorderFrameLease {
    const convert = (frame: ReturnType<InterfaceMjpegFrameLease['latest']>) =>
      frame
        ? {
            screenshot: toMjpegFrameDataUrl(frame.data, frame.contentType),
            capturedAt: frame.capturedAt,
            frameToken: frame.frameToken,
            source: 'shared-frame-stream' as const,
          }
        : undefined;
    return {
      latest: async () => convert(lease.latest()),
      waitForFrameAfter: async (capturedAt, timeoutMs) =>
        convert(await lease.waitForFrameAfter(capturedAt, timeoutMs)),
      release: () => lease.release(),
    };
  }

  private stopDeviceFrameSource(
    state = this.deviceFrameSourceLeaseState,
  ): void {
    if (!state || this.deviceFrameSourceLeaseState !== state) {
      return;
    }
    if (state.stopTimer) {
      clearTimeout(state.stopTimer);
    }
    this.deviceFrameSourceLeaseState = undefined;
    void Promise.resolve(state.source.stop()).catch((error) => {
      debugMjpeg('failed to stop device frame source: %s', error);
    });
  }

  private invalidateDeviceFrameSource(): void {
    this.deviceFrameSourceGeneration += 1;
    this.deviceFrameSourceOpening = undefined;
    this.stopDeviceFrameSource();
  }

  private stopDetachedDeviceFrameSource(source: DeviceFrameSource): void {
    void Promise.resolve(source.stop()).catch((error) => {
      debugMjpeg('failed to stop stale device frame source: %s', error);
    });
  }

  private async getOrOpenDeviceFrameSource(
    activeInterface: ActiveInterface,
  ): Promise<DeviceFrameSourceLeaseState | undefined> {
    const current = this.deviceFrameSourceLeaseState;
    if (current && current.activeInterface === activeInterface) {
      if (current.stopTimer) {
        clearTimeout(current.stopTimer);
        current.stopTimer = undefined;
      }
      return current;
    }
    if (current && current.activeInterface !== activeInterface) {
      this.invalidateDeviceFrameSource();
    }
    if (!activeInterface.openFrameSource) {
      return undefined;
    }
    const existingOpening = this.deviceFrameSourceOpening;
    if (
      existingOpening?.activeInterface === activeInterface &&
      existingOpening.generation === this.deviceFrameSourceGeneration
    ) {
      return existingOpening.promise;
    }
    if (existingOpening) {
      this.invalidateDeviceFrameSource();
    }
    const generation = this.deviceFrameSourceGeneration;
    const openingPromise: Promise<DeviceFrameSourceLeaseState | undefined> =
      Promise.resolve()
        .then(() => activeInterface.openFrameSource?.())
        .then((source) => {
          if (!source) {
            return undefined;
          }
          if (
            generation !== this.deviceFrameSourceGeneration ||
            this.source.getActiveInterface() !== activeInterface
          ) {
            this.stopDetachedDeviceFrameSource(source);
            return undefined;
          }
          const state: DeviceFrameSourceLeaseState = {
            activeInterface,
            source,
            leaseCount: 0,
          };
          this.stopDeviceFrameSource();
          this.deviceFrameSourceLeaseState = state;
          return state;
        })
        .catch((error) => {
          debugMjpeg('device frame source unavailable: %s', error);
          return undefined;
        })
        .finally(() => {
          if (this.deviceFrameSourceOpening?.promise === openingPromise) {
            this.deviceFrameSourceOpening = undefined;
          }
        });
    this.deviceFrameSourceOpening = {
      activeInterface,
      generation,
      promise: openingPromise,
    };
    return openingPromise;
  }

  private getDeviceFrameToken(
    state: DeviceFrameSourceLeaseState,
    frame: DeviceFrameRef,
  ) {
    if (
      state.lastOpaqueRef === frame.ref &&
      state.lastCapturedAt === frame.capturedAt &&
      state.lastFrameToken
    ) {
      return state.lastFrameToken;
    }
    state.lastOpaqueRef = frame.ref;
    state.lastCapturedAt = frame.capturedAt;
    state.lastFrameToken = `device-frame-${frame.capturedAt}-${++this.deviceFrameTokenSequence}`;
    return state.lastFrameToken;
  }

  private materializeDeviceFrame(
    state: DeviceFrameSourceLeaseState,
    frame: DeviceFrameRef,
  ): Promise<RecorderFrameSnapshot | undefined> {
    const decoded = state.decoded;
    if (
      decoded &&
      decoded.opaqueRef === frame.ref &&
      decoded.capturedAt === frame.capturedAt
    ) {
      return decoded.snapshot;
    }
    const frameToken = this.getDeviceFrameToken(state, frame);
    const snapshot = state.source
      .decode([frame])
      .then((images) =>
        images[0]
          ? {
              screenshot: images[0],
              capturedAt: frame.capturedAt,
              frameToken,
              source: 'shared-frame-stream' as const,
            }
          : undefined,
      )
      .catch((error) => {
        debugMjpeg('failed to decode device frame ref: %s', error);
        return undefined;
      });
    state.decoded = {
      opaqueRef: frame.ref,
      capturedAt: frame.capturedAt,
      snapshot,
    };
    return snapshot;
  }

  private async acquireDeviceFrameSourceLease(
    activeInterface: ActiveInterface,
  ): Promise<RecorderFrameLease | null> {
    const state = await this.getOrOpenDeviceFrameSource(activeInterface);
    if (!state) {
      return null;
    }
    state.leaseCount += 1;
    let released = false;
    const latest = async () => {
      if (released || this.deviceFrameSourceLeaseState !== state) {
        return undefined;
      }
      const frame = state.source.latest();
      return frame ? this.materializeDeviceFrame(state, frame) : undefined;
    };
    return {
      latest,
      waitForFrameAfter: async (capturedAt, timeoutMs) => {
        const deadlineAt = Date.now() + Math.max(0, timeoutMs);
        while (!released && this.deviceFrameSourceLeaseState === state) {
          const frame = state.source.latest();
          if (frame && frame.capturedAt >= capturedAt) {
            return this.materializeDeviceFrame(state, frame);
          }
          const remainingMs = deadlineAt - Date.now();
          if (remainingMs <= 0) {
            return undefined;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(25, remainingMs)),
          );
        }
        return undefined;
      },
      release: () => {
        if (released) return;
        released = true;
        state.leaseCount = Math.max(0, state.leaseCount - 1);
        if (state.leaseCount === 0) {
          state.stopTimer = setTimeout(
            () => this.stopDeviceFrameSource(state),
            INTERFACE_MJPEG_IDLE_STOP_MS,
          );
          state.stopTimer.unref?.();
        }
      },
    };
  }

  async serve(req: Request, res: Response): Promise<void> {
    const nativeUrl = this.source.getNativeUrl();
    const recentlyFailed =
      this.nativeAvailable === false &&
      this.nativeFailedAt !== null &&
      Date.now() - this.nativeFailedAt < NEGATIVE_CACHE_MS;

    if (nativeUrl && !recentlyFailed) {
      const proxied = await this.probeAndProxyNative(nativeUrl, req, res);
      if (proxied) return;
    }

    const activeInterface = this.source.getActiveInterface();
    if (activeInterface) {
      const interfaceStreamStarted = await this.interfaceMjpegHub.streamRequest(
        req,
        res,
        activeInterface,
        async (startupError) =>
          (await this.source.recoverFromPreviewError?.(
            startupError,
            'interface MJPEG startup',
          )) ?? null,
      );
      if (interfaceStreamStarted) return;
    }

    if (!this.source.canTakeScreenshot()) {
      res.status(500).json({
        error: 'Screenshot method not available on current interface',
      });
      return;
    }

    await this.streamPolling(req, res);
  }

  private probeAndProxyNative(
    nativeUrl: string,
    req: Request,
    res: Response,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      debugMjpeg(`trying native stream from ${nativeUrl}`);
      const proxyReq = http.get(nativeUrl, (proxyRes) => {
        const statusCode = proxyRes.statusCode ?? 0;
        if (statusCode >= 400) {
          this.nativeAvailable = false;
          this.nativeFailedAt = Date.now();
          proxyRes.resume();
          debugMjpeg(
            `native stream returned HTTP ${statusCode}, using polling mode`,
          );
          resolve(false);
          return;
        }
        this.nativeAvailable = true;
        this.nativeFailedAt = null;
        debugMjpeg('streaming via native WDA MJPEG server');
        const contentType = proxyRes.headers['content-type'];
        if (contentType) res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Connection', 'keep-alive');
        proxyRes.pipe(res);
        req.on('close', () => proxyReq.destroy());
        resolve(true);
      });
      proxyReq.on('error', (err) => {
        this.nativeAvailable = false;
        this.nativeFailedAt = Date.now();
        debugMjpeg(
          `native stream unavailable (${err.message}), using polling mode`,
        );
        resolve(false);
      });
    });
  }

  private probeNativeLiveness(nativeUrl: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const probe = http.get(nativeUrl, (probeRes) => {
        const statusCode = probeRes.statusCode ?? 0;
        const reachable = statusCode >= 200 && statusCode < 400;
        probeRes.destroy();
        resolve(reachable);
      });
      probe.setTimeout(1000, () => {
        probe.destroy();
        resolve(false);
      });
      probe.on('error', () => resolve(false));
    });
  }

  private async streamPolling(req: Request, res: Response): Promise<void> {
    const parsedFps = Number(req.query.fps);
    const fps = Math.min(
      Math.max(Number.isNaN(parsedFps) ? DEFAULT_FPS : parsedFps, 1),
      MAX_FPS,
    );
    const interval = Math.round(1000 / fps);
    const boundary = 'mjpeg-boundary';
    debugMjpeg(`streaming via polling mode (${fps}fps)`);

    res.setHeader(
      'Content-Type',
      `multipart/x-mixed-replace; boundary=${boundary}`,
    );
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Connection', 'keep-alive');

    let stopped = false;
    let consecutiveErrors = 0;

    // While in polling mode, periodically re-probe the native URL. As soon
    // as it becomes reachable, destroy this socket so the client's <img>
    // fires onError and reconnects onto the native stream. (res.end() leaves
    // the multipart frame visually frozen in some browsers.)
    const nativeUrl = this.source.getNativeUrl();
    let probeTimer: ReturnType<typeof setInterval> | undefined;
    if (nativeUrl) {
      probeTimer = setInterval(async () => {
        if (stopped) return;
        const reachable = await this.probeNativeLiveness(nativeUrl);
        if (reachable && !stopped) {
          debugMjpeg(
            'native stream came online, ending polling so client reconnects',
          );
          this.nativeAvailable = true;
          this.nativeFailedAt = null;
          stopped = true;
          try {
            res.destroy();
          } catch {
            /* socket already closed */
          }
        }
      }, NATIVE_PROBE_INTERVAL_MS);
    }
    req.on('close', () => {
      stopped = true;
      if (probeTimer) clearInterval(probeTimer);
    });

    while (!stopped) {
      if (!this.source.isAgentReady()) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      const frameStart = Date.now();
      try {
        const base64 = await this.source.takeScreenshot();
        if (stopped) break;
        consecutiveErrors = 0;
        const capturedAt = Date.now();
        this.lastPollingFrame = {
          screenshot: toMjpegFrameDataUrl(base64),
          capturedAt,
          frameToken: `polling-${capturedAt}`,
          source: 'shared-frame-stream',
        };

        writeMjpegFrame(res, boundary, {
          data: base64,
          contentType: 'image/jpeg',
        });
      } catch (err) {
        if (stopped) break;
        const recoveredInterface = await this.source.recoverFromPreviewError?.(
          err,
          'polling MJPEG frame capture',
        );
        if (recoveredInterface) {
          consecutiveErrors = 0;
          continue;
        }
        consecutiveErrors++;
        if (consecutiveErrors <= ERROR_LOG_THRESHOLD) {
          console.error('MJPEG frame error:', err);
        } else if (consecutiveErrors === ERROR_LOG_THRESHOLD + 1) {
          console.error(
            'MJPEG: suppressing further errors, retrying silently...',
          );
        }
        const backoff = Math.min(
          1000 * consecutiveErrors,
          MAX_ERROR_BACKOFF_MS,
        );
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      const elapsed = Date.now() - frameStart;
      const remaining = interval - elapsed;
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
    }
    if (probeTimer) clearInterval(probeTimer);
  }
}
