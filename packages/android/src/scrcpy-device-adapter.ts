import type { Size } from '@midscene/core';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import type { RawKeyframe, ScrcpyScreenshotManager } from './scrcpy-manager';
import { DEFAULT_SCRCPY_CONFIG } from './scrcpy-manager';

const debugAdapter = getDebug('android:scrcpy-adapter');

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

/**
 * Adapter that encapsulates all scrcpy-related logic for AndroidDevice.
 * Handles config normalization, manager lifecycle, screenshot, and resolution.
 */
export class ScrcpyDeviceAdapter {
  private manager: ScrcpyScreenshotManager | null = null;
  private resolvedConfig: ResolvedScrcpyConfig | null = null;
  private initFailed = false;

  constructor(
    private deviceId: string,
    private scrcpyConfig: ScrcpyConfig | undefined,
    private resolveAdbServerEndpoint: ResolveAdbServerEndpoint = () =>
      DEFAULT_ADB_SERVER_ENDPOINT,
  ) {}

  isEnabled(): boolean {
    if (this.initFailed) return false;
    return this.scrcpyConfig?.enabled ?? DEFAULT_SCRCPY_CONFIG.enabled;
  }

  /**
   * Initialize scrcpy connection. Called once during device.connect().
   * If initialization fails, marks scrcpy as permanently disabled (no further retries).
   */
  async initialize(deviceInfo: DevicePhysicalInfo): Promise<void> {
    try {
      const manager = await this.ensureManager(deviceInfo);
      await manager.ensureConnected();
    } catch (error) {
      this.initFailed = true;
      throw error;
    }
  }

  /**
   * Resolve scrcpy config.
   * maxSize defaults to 0 (no scaling, full physical resolution) so the Agent layer
   * receives the highest quality image for AI processing.
   * videoBitRate is auto-scaled based on physical pixel count to ensure
   * sufficient quality for all-I-frame H.264 encoding.
   */
  resolveConfig(deviceInfo: DevicePhysicalInfo): ResolvedScrcpyConfig {
    if (this.resolvedConfig) return this.resolvedConfig;

    const config = this.scrcpyConfig;
    const maxSize = config?.maxSize ?? DEFAULT_SCRCPY_CONFIG.maxSize;

    const videoBitRate =
      config?.videoBitRate ?? DEFAULT_SCRCPY_CONFIG.videoBitRate;

    this.resolvedConfig = {
      enabled: this.isEnabled(),
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

      const config = this.resolveConfig(deviceInfo);
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
    const manager = await this.ensureManager(deviceInfo);
    const screenshotBuffer = await manager.getScreenshotJpeg();

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
    const manager = await this.ensureManager(deviceInfo);
    await manager.ensureConnected();
    return manager.subscribeKeyframes(listener);
  }

  /** Latest raw keyframe seen on the stream, or null if none yet. */
  getLatestRawKeyframe(): RawKeyframe | null {
    return this.manager?.getLatestRawKeyframe() ?? null;
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
    if (this.manager) {
      try {
        await this.manager.disconnect();
      } catch (error) {
        debugAdapter(`Error disconnecting scrcpy: ${error}`);
      }
      this.manager = null;
    }
    this.resolvedConfig = null;
  }
}
