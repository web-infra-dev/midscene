import type { Size } from '@midscene/core';
import type { AndroidDeviceOpt } from '@midscene/core/device';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import type { Adb as YumeAdb } from '@yume-chan/adb';
import { createAndroidAdb } from './adb';
import type { RawKeyframe, ScrcpyScreenshotManager } from './scrcpy-manager';
import {
  DEFAULT_SCRCPY_CONFIG,
  type ScrcpyFreshFrameUnavailableError,
  isScrcpyFreshFrameUnavailableError,
} from './scrcpy-manager';

const debugAdapter = getDebug('android:scrcpy-adapter');
const SCRCPY_RETRY_COOLDOWN_MS = 5_000;

export function formatScrcpyFreshFrameFailure(
  error: ScrcpyFreshFrameUnavailableError,
): string {
  const videoBitRate = error.videoBitRate;
  const timeoutMs = Number.isFinite(error.timeoutMs)
    ? error.timeoutMs
    : error.failureKind === 'stream-startup'
      ? 5_000
      : 300;
  if (error.failureKind === 'stream-startup') {
    return `The new scrcpy stream did not produce a usable baseline frame within ${timeoutMs}ms. This is a stream startup or encoder-readiness failure, not evidence that the configured video bitrate is too high.`;
  }

  const bitRateDescription = Number.isFinite(videoBitRate)
    ? ` Current videoBitRate: ${videoBitRate} bps (${videoBitRate / 1_000_000} Mbps).`
    : '';
  return `No usable scrcpy frame crossed the active freshness target within ${timeoutMs}ms. This can happen when a static screen emits no new encoded frame, or when the video stream or transport is interrupted. This timeout does not by itself identify bandwidth or the configured video bitrate as the cause.${bitRateDescription}`;
}

type ScrcpyConfig = NonNullable<AndroidDeviceOpt['scrcpyConfig']>;
type ResolvedScrcpyConfig = Required<ScrcpyConfig>;

/** ADB capabilities scrcpy needs from the canonical Appium transport. */
export interface ScrcpyAdbBackend {
  adbHost?: string;
  adbPort?: number;
  push(localPath: string, remotePath: string): Promise<unknown>;
}

export type ResolveScrcpyAdbBackend = () =>
  | ScrcpyAdbBackend
  | Promise<ScrcpyAdbBackend>;

export interface DevicePhysicalInfo {
  physicalWidth: number;
  physicalHeight: number;
  dpr: number;
  orientation: number;
  isCurrentOrientation?: boolean;
}

export interface ScrcpyStatus {
  enabled: boolean;
  connected: boolean;
  lastError: string | null;
  retryAfter: number | null;
}

/**
 * Adapter that encapsulates all scrcpy-related logic for AndroidDevice.
 * Handles config normalization, manager lifecycle, screenshot, and resolution.
 */
export class ScrcpyDeviceAdapter {
  private manager: ScrcpyScreenshotManager | null = null;
  private managerPromise: Promise<ScrcpyScreenshotManager> | null = null;
  private resolvedConfig: ResolvedScrcpyConfig | null = null;
  private lastError: string | null = null;
  private retryAfter: number | null = null;
  private freshnessRestartPromise: Promise<Buffer> | null = null;
  private lifecycleGeneration = 0;
  private pendingActionBarrierAtHostUs: bigint | null = null;
  private keyframeListeners = new Set<(frame: RawKeyframe) => void>();
  private keyframeUnsubscribers = new Map<
    (frame: RawKeyframe) => void,
    {
      manager: ScrcpyScreenshotManager;
      unsubscribe: () => void;
    }
  >();

  constructor(
    private deviceId: string,
    private scrcpyConfig: ScrcpyConfig | undefined,
    private resolveAdbBackend: ResolveScrcpyAdbBackend = () =>
      createAndroidAdb({ adbExecTimeout: 60_000, deviceId }),
  ) {}

  isEnabled(): boolean {
    if (!this.isConfigured()) return false;
    return this.retryAfter === null || Date.now() >= this.retryAfter;
  }

  getStatus(): ScrcpyStatus {
    return {
      enabled: this.isConfigured(),
      connected: this.manager?.isConnected() ?? false,
      lastError: this.lastError,
      retryAfter: this.retryAfter,
    };
  }

  private isConfigured(): boolean {
    return this.scrcpyConfig?.enabled ?? DEFAULT_SCRCPY_CONFIG.enabled;
  }

  /**
   * Initialize scrcpy connection. Called during device.connect() and explicit retries.
   */
  async initialize(deviceInfo: DevicePhysicalInfo): Promise<void> {
    try {
      const manager = await this.ensureConnectedManager(deviceInfo);
      await this.applyPendingActionBarrier(manager);
      this.clearFailure();
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  private recordFailure(error: unknown): void {
    this.lastError = error instanceof Error ? error.message : String(error);
    this.retryAfter = Date.now() + SCRCPY_RETRY_COOLDOWN_MS;
  }

  private clearFailure(): void {
    this.lastError = null;
    this.retryAfter = null;
  }

  private ensureRetryReady(): void {
    if (this.retryAfter === null || Date.now() >= this.retryAfter) {
      return;
    }

    throw new Error(
      `scrcpy retry is cooling down until ${new Date(this.retryAfter).toISOString()}. Last error: ${this.lastError}`,
    );
  }

  /**
   * Resolve scrcpy config.
   * maxSize defaults to 0 (no scaling, full physical resolution) so the Agent layer
   * receives the highest quality image for AI processing.
   * videoBitRate uses the shared default unless explicitly configured.
   */
  resolveConfig(): ResolvedScrcpyConfig;
  /**
   * @deprecated Device geometry no longer affects scrcpy configuration. Call
   * `resolveConfig()` without arguments.
   */
  resolveConfig(_deviceInfo: DevicePhysicalInfo): ResolvedScrcpyConfig;
  resolveConfig(_deviceInfo?: DevicePhysicalInfo): ResolvedScrcpyConfig {
    if (this.resolvedConfig) return this.resolvedConfig;

    const config = this.scrcpyConfig;
    const maxSize = config?.maxSize ?? DEFAULT_SCRCPY_CONFIG.maxSize;
    if (!Number.isInteger(maxSize) || maxSize < 0) {
      throw new Error(
        `Invalid scrcpyConfig.maxSize: expected a non-negative integer, received ${maxSize}`,
      );
    }

    const videoBitRate =
      config?.videoBitRate ?? DEFAULT_SCRCPY_CONFIG.videoBitRate;
    const videoResetFrameTimeoutMs =
      config?.videoResetFrameTimeoutMs ??
      DEFAULT_SCRCPY_CONFIG.videoResetFrameTimeoutMs;
    if (
      !Number.isInteger(videoResetFrameTimeoutMs) ||
      videoResetFrameTimeoutMs <= 0
    ) {
      throw new Error(
        `Invalid scrcpyConfig.videoResetFrameTimeoutMs: expected a positive integer, received ${videoResetFrameTimeoutMs}`,
      );
    }

    this.resolvedConfig = {
      enabled: this.isConfigured(),
      maxSize,
      idleTimeoutMs:
        config?.idleTimeoutMs ?? DEFAULT_SCRCPY_CONFIG.idleTimeoutMs,
      videoBitRate,
      videoResetFrameTimeoutMs,
    };

    return this.resolvedConfig;
  }

  /**
   * Get or create the ScrcpyScreenshotManager.
   * Uses dynamic import for @yume-chan packages (ESM-only, must use await import in CJS builds).
   */
  async ensureManager(
    _deviceInfo: DevicePhysicalInfo,
  ): Promise<ScrcpyScreenshotManager> {
    if (this.manager) return this.manager;
    if (this.managerPromise) return this.managerPromise;

    debugAdapter('Initializing Scrcpy manager...');

    const generation = this.lifecycleGeneration;
    const managerPromise = (async () => {
      let adb: YumeAdb | null = null;
      let manager: ScrcpyScreenshotManager | null = null;
      try {
        const { Adb, AdbServerClient } = await import('@yume-chan/adb');
        const { AdbServerNodeTcpConnector } = await import(
          '@yume-chan/adb-server-node-tcp'
        );
        const { ScrcpyScreenshotManager: ScrcpyManager } = await import(
          './scrcpy-manager'
        );

        const adbBackend = await this.resolveAdbBackend();
        const adbClient = new AdbServerClient(
          new AdbServerNodeTcpConnector({
            host: adbBackend.adbHost ?? '127.0.0.1',
            port: adbBackend.adbPort ?? 5037,
          }),
        );
        adb = new Adb(
          await adbClient.createTransport({ serial: this.deviceId }),
        );

        const config = this.resolveConfig();
        manager = new ScrcpyManager(
          adb,
          async (localPath, remotePath) => {
            await adbBackend.push(localPath, remotePath);
          },
          {
            maxSize: config.maxSize,
            videoBitRate: config.videoBitRate,
            idleTimeoutMs: config.idleTimeoutMs,
            videoResetFrameTimeoutMs: config.videoResetFrameTimeoutMs,
          },
        );

        // Validate environment prerequisites (ffmpeg, etc.) once before caching.
        // If validation fails, dispose the owned ADB transport before propagating
        // the error to the caller, which can fall back to ADB screenshots.
        await manager.validateEnvironment();

        if (generation !== this.lifecycleGeneration) {
          throw new Error(
            'Scrcpy manager initialization was superseded by device cleanup',
          );
        }

        this.manager = manager;
        debugAdapter('Scrcpy manager initialized');
        return manager;
      } catch (error) {
        try {
          if (manager) {
            await manager.dispose();
          } else {
            await adb?.close();
          }
        } catch (cleanupError) {
          debugAdapter(
            `Failed to clean up Scrcpy manager initialization: ${cleanupError}`,
          );
        }
        debugAdapter(`Failed to initialize Scrcpy manager: ${error}`);
        throw new Error(
          `Failed to initialize Scrcpy for device ${this.deviceId}. ` +
            `Ensure ADB server is running and device is connected. Error: ${error}`,
        );
      }
    })();

    this.managerPromise = managerPromise;
    try {
      return await managerPromise;
    } finally {
      if (this.managerPromise === managerPromise) {
        this.managerPromise = null;
      }
    }
  }

  /**
   * Connect the current manager and restore adapter-owned frame subscriptions
   * whenever this call establishes a new stream epoch. Existing connections
   * keep their current subscriptions without churn.
   */
  private async ensureConnectedManager(
    deviceInfo: DevicePhysicalInfo,
  ): Promise<ScrcpyScreenshotManager> {
    const manager = await this.ensureManager(deviceInfo);
    const wasConnected = manager.isConnected();
    await manager.ensureConnected();
    this.attachKeyframeListeners(manager, !wasConnected);
    return manager;
  }

  /**
   * Take a screenshot via scrcpy, returns base64 string.
   * A stale established stream is restarted once so a static screen can use a
   * fresh frame from the new epoch. Throws only when that retry also fails, so
   * the caller can fall back to ADB.
   */
  async screenshotBase64(deviceInfo: DevicePhysicalInfo): Promise<string> {
    this.ensureRetryReady();

    try {
      const manager = await this.ensureConnectedManager(deviceInfo);
      await this.applyPendingActionBarrier(manager);
      const screenshotBuffer = await manager.getScreenshotJpeg();
      this.clearFailure();

      return this.jpegBufferToBase64(screenshotBuffer);
    } catch (error) {
      if (!isScrcpyFreshFrameUnavailableError(error)) {
        this.recordFailure(error);
        throw error;
      }

      debugAdapter(
        `Scrcpy freshness target was unavailable; restarting the stream once before ADB fallback: ${error}`,
      );

      try {
        const screenshotBuffer = await this.restartAndCaptureOnce(deviceInfo);
        this.clearFailure();
        debugAdapter('Scrcpy screenshot recovered on a new stream epoch');
        return this.jpegBufferToBase64(screenshotBuffer);
      } catch (retryError) {
        this.keyframeUnsubscribers.clear();
        this.recordFailure(retryError);
        throw retryError;
      }
    }
  }

  private async restartAndCaptureOnce(
    deviceInfo: DevicePhysicalInfo,
  ): Promise<Buffer> {
    if (this.freshnessRestartPromise) {
      return this.freshnessRestartPromise;
    }

    const generation = this.lifecycleGeneration;
    const restartPromise = (async () => {
      const manager = await this.ensureConnectedManager(deviceInfo);
      await this.applyPendingActionBarrier(manager);
      if (generation !== this.lifecycleGeneration) {
        throw new Error('Scrcpy freshness restart was cancelled by cleanup');
      }
      return manager.getScreenshotJpeg();
    })();

    this.freshnessRestartPromise = restartPromise;
    try {
      return await restartPromise;
    } finally {
      if (this.freshnessRestartPromise === restartPromise) {
        this.freshnessRestartPromise = null;
      }
    }
  }

  private jpegBufferToBase64(screenshotBuffer: Buffer): string {
    return createImgBase64ByFormat('jpeg', screenshotBuffer.toString('base64'));
  }

  /**
   * Subscribe to raw keyframes from the scrcpy stream (ensures the stream is
   * connected first). Frames are raw H.264 — no decoding cost. While
   * subscribed, incoming frames keep the connection alive. Returns an
   * unsubscribe function.
   */
  async subscribeKeyframes(
    deviceInfo: DevicePhysicalInfo,
    listener: (frame: RawKeyframe) => void,
  ): Promise<() => void> {
    this.ensureRetryReady();
    this.keyframeListeners.add(listener);

    try {
      const manager = await this.ensureConnectedManager(deviceInfo);
      await this.applyPendingActionBarrier(manager);
      await manager.ensureFrameClockCalibration();
      this.clearFailure();
      return () => {
        this.keyframeListeners.delete(listener);
        this.keyframeUnsubscribers.get(listener)?.unsubscribe();
        this.keyframeUnsubscribers.delete(listener);
      };
    } catch (error) {
      this.keyframeListeners.delete(listener);
      this.keyframeUnsubscribers.get(listener)?.unsubscribe();
      this.keyframeUnsubscribers.delete(listener);
      this.recordFailure(error);
      throw error;
    }
  }

  /** Latest raw keyframe seen on the stream, or null if none yet. */
  getLatestRawKeyframe(): RawKeyframe | null {
    return this.manager?.getLatestRawKeyframe() ?? null;
  }

  private attachKeyframeListener(
    manager: ScrcpyScreenshotManager,
    listener: (frame: RawKeyframe) => void,
    force: boolean,
  ): void {
    const existing = this.keyframeUnsubscribers.get(listener);
    if (!force && existing?.manager === manager) return;
    existing?.unsubscribe();
    this.keyframeUnsubscribers.set(listener, {
      manager,
      unsubscribe: manager.subscribeKeyframes(listener),
    });
  }

  private attachKeyframeListeners(
    manager: ScrcpyScreenshotManager,
    force: boolean,
  ): void {
    for (const listener of this.keyframeListeners) {
      this.attachKeyframeListener(manager, listener, force);
    }
  }

  private async applyPendingActionBarrier(
    manager: ScrcpyScreenshotManager,
  ): Promise<void> {
    const actionCompletedAtHostUs = this.pendingActionBarrierAtHostUs;
    if (actionCompletedAtHostUs === null) return;
    await manager.setFreshnessBarrier(
      'completed input action while scrcpy was unavailable',
      {
        hostMonotonicUs: actionCompletedAtHostUs,
      },
    );
    if (this.pendingActionBarrierAtHostUs === actionCompletedAtHostUs) {
      this.pendingActionBarrierAtHostUs = null;
    }
  }

  private monotonicTimeUs(): bigint {
    return process.hrtime.bigint() / 1_000n;
  }

  private deferActionBarrier(actionCompletedAtHostUs: bigint): void {
    if (
      this.pendingActionBarrierAtHostUs === null ||
      actionCompletedAtHostUs > this.pendingActionBarrierAtHostUs
    ) {
      this.pendingActionBarrierAtHostUs = actionCompletedAtHostUs;
    }
  }

  /**
   * Move the scrcpy PTS barrier past a completed input action. Barrier failures
   * must not turn a successfully injected action into an action error; disable
   * the stream and let subsequent captures use the existing ADB fallback.
   */
  async markActionBarrier(): Promise<void> {
    const actionCompletedAtHostUs = this.monotonicTimeUs();
    const manager = this.manager;
    if (!manager?.isConnected()) {
      this.deferActionBarrier(actionCompletedAtHostUs);
      return;
    }

    try {
      await manager.setFreshnessBarrier('completed input action', {
        hostMonotonicUs: actionCompletedAtHostUs,
      });
      if (
        this.pendingActionBarrierAtHostUs !== null &&
        this.pendingActionBarrierAtHostUs <= actionCompletedAtHostUs
      ) {
        this.pendingActionBarrierAtHostUs = null;
      }
      this.clearFailure();
    } catch (error) {
      this.deferActionBarrier(actionCompletedAtHostUs);
      this.recordFailure(error);
      debugAdapter(
        `Unable to mark scrcpy action barrier; disabling this stream: ${error}`,
      );
      try {
        await manager.dispose();
      } catch (disconnectError) {
        debugAdapter(
          `Error disconnecting scrcpy after barrier failure: ${disconnectError}`,
        );
      } finally {
        if (this.manager === manager) {
          this.manager = null;
        }
      }
    }
  }

  /**
   * Decode a raw keyframe to a JPEG data URL. Deferred, per-frame-expensive
   * step (one ffmpeg process per call) — only call on sampled frames.
   */
  async decodeRawKeyframeToJpegBase64(frame: RawKeyframe): Promise<string> {
    if (!this.manager) {
      throw new Error('scrcpy manager is not initialized');
    }
    const jpegBuffer = await this.manager.decodeRawKeyframeToJpeg(frame);
    return createImgBase64ByFormat('jpeg', jpegBuffer.toString('base64'));
  }

  /**
   * Get scrcpy's actual video resolution.
   * Returns null if scrcpy is not connected yet.
   */
  getResolution(): { width: number; height: number } | null {
    return this.manager?.getResolution() ?? null;
  }

  /**
   * Compute size from scrcpy resolution.
   * Returns null if scrcpy is not connected.
   */
  getSize(deviceInfo: DevicePhysicalInfo): Size | null {
    const resolution = this.getResolution();
    if (!resolution) return null;

    debugAdapter(
      `Using scrcpy resolution: ${resolution.width}x${resolution.height}`,
    );

    return {
      width: resolution.width,
      height: resolution.height,
    };
  }

  /**
   * Calculate the scaling ratio from physical to scrcpy resolution.
   */
  getScalingRatio(physicalWidth: number): number | null {
    const resolution = this.getResolution();
    if (!resolution) return null;
    return resolution.width / physicalWidth;
  }

  async disconnect(): Promise<void> {
    this.lifecycleGeneration += 1;
    this.pendingActionBarrierAtHostUs = null;
    for (const { unsubscribe } of this.keyframeUnsubscribers.values()) {
      unsubscribe();
    }
    this.keyframeUnsubscribers.clear();
    this.keyframeListeners.clear();

    if (this.freshnessRestartPromise) {
      await this.freshnessRestartPromise.catch(() => {});
    }

    if (this.managerPromise) {
      await this.managerPromise.catch(() => {});
    }

    if (this.manager) {
      try {
        await this.manager.dispose();
      } catch (error) {
        debugAdapter(`Error disconnecting scrcpy: ${error}`);
      }
      this.manager = null;
    }
    this.resolvedConfig = null;
    this.clearFailure();
  }
}
