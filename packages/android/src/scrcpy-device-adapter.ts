import type { Size } from '@midscene/core';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import type { RawKeyframe, ScrcpyScreenshotManager } from './scrcpy-manager';
import {
  DEFAULT_SCRCPY_CONFIG,
  type ScrcpyFreshFrameUnavailableError,
  isScrcpyFreshFrameUnavailableError,
} from './scrcpy-manager';

const debugAdapter = getDebug('android:scrcpy-adapter');
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
  private resolvedConfig: ResolvedScrcpyConfig | null = null;
  private lastError: string | null = null;
  private retryAfter: number | null = null;
  private freshnessRecoveryPending = false;
  private recoveryPromise: Promise<void> | null = null;
  private lifecycleGeneration = 0;
  private pendingActionBarrier = false;
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
    deviceInfo: DevicePhysicalInfo,
  ): Promise<ScrcpyScreenshotManager> {
    if (this.manager) return this.manager;

    debugAdapter('Initializing Scrcpy manager...');

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
      const adb = new Adb(
        await adbClient.createTransport({ serial: this.deviceId }),
      );

      const config = this.resolveConfig();
      const manager = new ScrcpyManager(adb, {
        maxSize: config.maxSize,
        videoBitRate: config.videoBitRate,
        idleTimeoutMs: config.idleTimeoutMs,
      });

      // Validate environment prerequisites (ffmpeg, etc.) once before caching.
      // If validation fails, the manager is not cached and the error propagates
      // to the caller, which falls back to ADB.
      await manager.validateEnvironment();

      this.manager = manager;
      debugAdapter('Scrcpy manager initialized');
      return this.manager;
    } catch (error) {
      debugAdapter(`Failed to initialize Scrcpy manager: ${error}`);
      throw new Error(
        `Failed to initialize Scrcpy for device ${this.deviceId}. ` +
          `Ensure ADB server is running and device is connected. Error: ${error}`,
      );
    }
  }

  /**
   * Take a screenshot via scrcpy, returns base64 string.
   * Throws on failure (caller should fallback to ADB).
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

      return createImgBase64ByFormat(
        'jpeg',
        screenshotBuffer.toString('base64'),
      );
    } catch (error) {
      if (isScrcpyFreshFrameUnavailableError(error)) {
        this.markFreshnessRecoveryPending(manager, error);
        throw error;
      }
      this.recordFailure(error);
      throw error;
    }
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
    manager: ScrcpyScreenshotManager | null,
    error: ScrcpyFreshFrameUnavailableError,
  ): void {
    this.lastError = error.message;
    this.retryAfter = null;
    this.freshnessRecoveryPending = true;
    this.keyframeUnsubscribers.clear();
    if (manager && this.manager === manager) {
      this.manager = null;
    }
  }

  private async applyPendingActionBarrier(
    manager: ScrcpyScreenshotManager,
  ): Promise<void> {
    if (!this.pendingActionBarrier) return;
    await manager.setFreshnessBarrier(
      'completed input action while scrcpy was unavailable',
    );
    this.pendingActionBarrier = false;
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
          await manager.disconnect();
          if (this.manager === manager) this.manager = null;
          return;
        }
        this.attachKeyframeListeners(manager);
        this.clearFailure();
        debugAdapter('Scrcpy freshness recovery completed in background');
      } catch (error) {
        if (manager) {
          await manager.disconnect();
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
    const manager = this.manager;
    if (!manager?.isConnected()) {
      this.pendingActionBarrier = true;
      return;
    }

    try {
      await manager.setFreshnessBarrier('completed input action');
      this.pendingActionBarrier = false;
      this.clearFailure();
    } catch (error) {
      this.pendingActionBarrier = true;
      this.recordFailure(error);
      debugAdapter(
        `Unable to mark scrcpy action barrier; disabling this stream: ${error}`,
      );
      try {
        await manager.disconnect();
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
    this.pendingActionBarrier = false;
    for (const unsubscribe of this.keyframeUnsubscribers.values()) {
      unsubscribe();
    }
    this.keyframeUnsubscribers.clear();
    this.keyframeListeners.clear();

    if (this.recoveryPromise) {
      await this.recoveryPromise.catch(() => {});
    }

    if (this.manager) {
      try {
        await this.manager.disconnect();
      } catch (error) {
        debugAdapter(`Error disconnecting scrcpy: ${error}`);
      }
      this.manager = null;
    }
    this.resolvedConfig = null;
    this.clearFailure();
  }
}
