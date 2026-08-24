import type { Size } from '@midscene/core';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import type { Adb as YumeAdb } from '@yume-chan/adb';
import type { RawKeyframe, ScrcpyScreenshotManager } from './scrcpy-manager';
import {
  DEFAULT_SCRCPY_CONFIG,
  type ScrcpyFreshFrameUnavailableError,
  isScrcpyFreshFrameUnavailableError,
} from './scrcpy-manager';

const debugAdapter = getDebug('android:scrcpy-adapter');
const warnAdapter = getDebug('android:scrcpy-adapter', { console: true });
const SCRCPY_RETRY_COOLDOWN_MS = 5_000;

interface ScrcpyConfig {
  enabled?: boolean;
  maxSize?: number;
  videoBitRate?: number;
  idleTimeoutMs?: number;
}

interface ResolvedScrcpyConfig {
  enabled: boolean;
  maxSize: number;
  videoBitRate: number;
  idleTimeoutMs: number;
}

interface AdbServerEndpoint {
  host: string;
  port: number;
}

type ResolveAdbServerEndpoint = () =>
  | AdbServerEndpoint
  | Promise<AdbServerEndpoint>;

const DEFAULT_ADB_SERVER_ENDPOINT: AdbServerEndpoint = {
  host: '127.0.0.1',
  port: 5037,
};

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
  private freshnessRecoveryPending = false;
  private freshnessRestartPromise: Promise<Buffer> | null = null;
  private recoveryPromise: Promise<void> | null = null;
  private lifecycleGeneration = 0;
  private pendingActionBarrierAtHostUs: bigint | null = null;
  private keyframeListeners = new Set<(frame: RawKeyframe) => void>();
  private keyframeUnsubscribers = new Map<
    (frame: RawKeyframe) => void,
    () => void
  >();

  constructor(
    private deviceId: string,
    private scrcpyConfig: ScrcpyConfig | undefined,
    private resolveAdbServerEndpoint: ResolveAdbServerEndpoint = () =>
      DEFAULT_ADB_SERVER_ENDPOINT,
  ) {}

  isEnabled(): boolean {
    if (!this.isConfigured()) return false;
    if (this.freshnessRecoveryPending || this.recoveryPromise) return false;
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
    if (this.recoveryPromise) {
      await this.recoveryPromise;
      if (this.manager?.isConnected()) return;
    }
    this.freshnessRecoveryPending = false;
    try {
      const manager = await this.ensureManager(deviceInfo);
      await manager.ensureConnected();
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
    this.freshnessRecoveryPending = false;
  }

  private clearFailure(): void {
    this.lastError = null;
    this.retryAfter = null;
    this.freshnessRecoveryPending = false;
  }

  private ensureRetryReady(): void {
    if (this.freshnessRecoveryPending || this.recoveryPromise) {
      throw new Error('scrcpy freshness recovery is in progress');
    }
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

    this.resolvedConfig = {
      enabled: this.isConfigured(),
      maxSize,
      idleTimeoutMs:
        config?.idleTimeoutMs ?? DEFAULT_SCRCPY_CONFIG.idleTimeoutMs,
      videoBitRate,
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

        const adbServerEndpoint = await this.resolveAdbServerEndpoint();
        const adbClient = new AdbServerClient(
          new AdbServerNodeTcpConnector(adbServerEndpoint),
        );
        adb = new Adb(
          await adbClient.createTransport({ serial: this.deviceId }),
        );

        const config = this.resolveConfig();
        manager = new ScrcpyManager(adb, {
          maxSize: config.maxSize,
          videoBitRate: config.videoBitRate,
          idleTimeoutMs: config.idleTimeoutMs,
        });

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
   * Take a screenshot via scrcpy, returns base64 string.
   * A stale established stream is restarted once so a static screen can use
   * the new epoch's baseline frame. Throws only when that retry also fails, so
   * the caller can fall back to ADB.
   */
  async screenshotBase64(deviceInfo: DevicePhysicalInfo): Promise<string> {
    this.ensureRetryReady();

    let manager: ScrcpyScreenshotManager | null = null;
    try {
      manager = await this.ensureManager(deviceInfo);
      await manager.ensureConnected();
      await this.applyPendingActionBarrier(manager);
      const screenshotBuffer = await manager.getScreenshotJpeg();
      this.clearFailure();

      return this.jpegBufferToBase64(screenshotBuffer);
    } catch (error) {
      if (!isScrcpyFreshFrameUnavailableError(error)) {
        this.recordFailure(error);
        throw error;
      }

      this.markFreshnessRecoveryPending(error);
      debugAdapter(
        `Scrcpy freshness target was unavailable; restarting the stream once before ADB fallback: ${error}`,
      );

      try {
        const screenshotBuffer = await this.restartAndCaptureOnce(deviceInfo);
        manager = this.manager;
        if (!manager) {
          throw new Error(
            'Scrcpy manager disappeared after freshness recovery',
          );
        }
        this.attachKeyframeListeners(manager);
        this.clearFailure();
        debugAdapter('Scrcpy screenshot recovered on a new stream epoch');
        return this.jpegBufferToBase64(screenshotBuffer);
      } catch (retryError) {
        if (isScrcpyFreshFrameUnavailableError(retryError)) {
          this.markFreshnessRecoveryPending(retryError);
        } else {
          this.recordFailure(retryError);
        }
        this.warnFreshnessFallback(error, retryError);
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
      const manager = await this.ensureManager(deviceInfo);
      await manager.ensureConnected();
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

  private warnFreshnessFallback(
    firstError: ScrcpyFreshFrameUnavailableError,
    retryError: unknown,
  ): void {
    const retryDiagnostic = isScrcpyFreshFrameUnavailableError(retryError)
      ? retryError.diagnosticMessage
      : undefined;
    warnAdapter(
      retryDiagnostic ??
        (firstError.diagnosticMessage
          ? `${firstError.diagnosticMessage}\nScrcpy stream restart error: ${retryError}`
          : undefined) ??
        `Scrcpy stream restart failed; falling back to ADB screenshot. Error: ${retryError}`,
    );
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
      const manager = await this.ensureManager(deviceInfo);
      await manager.ensureConnected();
      await this.applyPendingActionBarrier(manager);
      await manager.ensureFrameClockCalibration();
      this.clearFailure();
      this.attachKeyframeListener(manager, listener);
      return () => {
        this.keyframeListeners.delete(listener);
        this.keyframeUnsubscribers.get(listener)?.();
        this.keyframeUnsubscribers.delete(listener);
      };
    } catch (error) {
      this.keyframeListeners.delete(listener);
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
  ): void {
    this.keyframeUnsubscribers.get(listener)?.();
    this.keyframeUnsubscribers.set(
      listener,
      manager.subscribeKeyframes(listener),
    );
  }

  private attachKeyframeListeners(manager: ScrcpyScreenshotManager): void {
    this.keyframeUnsubscribers.clear();
    for (const listener of this.keyframeListeners) {
      this.attachKeyframeListener(manager, listener);
    }
  }

  private markFreshnessRecoveryPending(
    error: ScrcpyFreshFrameUnavailableError,
  ): void {
    this.lastError = error.message;
    this.retryAfter = null;
    this.freshnessRecoveryPending = true;
    this.keyframeUnsubscribers.clear();
    // ScrcpyScreenshotManager closes only the stale video epoch for this error.
    // Keep the manager so the retry reuses its owned yume ADB transport.
  }

  private async applyPendingActionBarrier(
    manager: ScrcpyScreenshotManager,
  ): Promise<void> {
    const actionCompletedAtHostUs = this.pendingActionBarrierAtHostUs;
    if (actionCompletedAtHostUs === null) return;
    await manager.setFreshnessBarrier(
      'completed input action while scrcpy was unavailable',
      {
        allowOverAgeForNextCapture: true,
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
   * Start a new scrcpy epoch only after the independent ADB screenshot has
   * completed, so stream startup does not compete with the fallback capture.
   */
  recoverAfterAdbScreenshot(deviceInfo: DevicePhysicalInfo): void {
    if (!this.freshnessRecoveryPending || this.recoveryPromise) return;

    const generation = this.lifecycleGeneration;
    const recovery = (async () => {
      let manager: ScrcpyScreenshotManager | null = null;
      try {
        manager = await this.ensureManager(deviceInfo);
        await manager.ensureConnected();
        await this.applyPendingActionBarrier(manager);
        await manager.prepareFreshFrame();
        if (generation !== this.lifecycleGeneration) {
          await manager.dispose();
          if (this.manager === manager) this.manager = null;
          return;
        }
        this.attachKeyframeListeners(manager);
        this.clearFailure();
        debugAdapter('Scrcpy freshness recovery completed in background');
      } catch (error) {
        if (manager) {
          await manager.dispose();
          if (this.manager === manager) this.manager = null;
        }
        this.freshnessRecoveryPending = false;
        this.recordFailure(error);
        debugAdapter(`Scrcpy background freshness recovery failed: ${error}`);
        throw error;
      }
    })();

    this.recoveryPromise = recovery;
    void recovery
      .catch(() => {})
      .finally(() => {
        if (this.recoveryPromise === recovery) {
          this.recoveryPromise = null;
        }
      });
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
        allowOverAgeForNextCapture: true,
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
    this.freshnessRecoveryPending = false;
    this.pendingActionBarrierAtHostUs = null;
    for (const unsubscribe of this.keyframeUnsubscribers.values()) {
      unsubscribe();
    }
    this.keyframeUnsubscribers.clear();
    this.keyframeListeners.clear();

    if (this.recoveryPromise) {
      await this.recoveryPromise.catch(() => {});
    }

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
