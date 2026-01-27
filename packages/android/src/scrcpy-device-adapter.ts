import type { Size } from '@midscene/core';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import type { ScrcpyScreenshotManager } from './scrcpy-manager';
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

  constructor(
    private deviceId: string,
    private scrcpyConfig: ScrcpyConfig | undefined,
    private screenshotResizeScale: number | undefined,
  ) {}

  isEnabled(): boolean {
    return this.scrcpyConfig?.enabled ?? DEFAULT_SCRCPY_CONFIG.enabled;
  }

  /**
   * Resolve scrcpy config with auto-calculated maxSize.
   * Auto-calculation uses 1/DPR or screenshotResizeScale to match Agent layer's logical size.
   */
  resolveConfig(deviceInfo: DevicePhysicalInfo): ResolvedScrcpyConfig {
    if (this.resolvedConfig) return this.resolvedConfig;

    const config = this.scrcpyConfig;
    let maxSize = config?.maxSize ?? DEFAULT_SCRCPY_CONFIG.maxSize;

    // Auto-calculate maxSize if not explicitly set
    if (config?.maxSize === undefined) {
      const physicalMax = Math.max(
        deviceInfo.physicalWidth,
        deviceInfo.physicalHeight,
      );
      const scale = this.screenshotResizeScale ?? 1 / deviceInfo.dpr;
      maxSize = Math.round(physicalMax * scale);
      debugAdapter(
        `Auto-calculated maxSize: ${maxSize} (physical=${physicalMax}, scale=${scale.toFixed(3)}, ${
          this.screenshotResizeScale !== undefined
            ? 'from screenshotResizeScale'
            : 'from 1/dpr'
        })`,
      );
    }

    this.resolvedConfig = {
      enabled: this.isEnabled(),
      maxSize,
      idleTimeoutMs:
        config?.idleTimeoutMs ?? DEFAULT_SCRCPY_CONFIG.idleTimeoutMs,
      videoBitRate: config?.videoBitRate ?? DEFAULT_SCRCPY_CONFIG.videoBitRate,
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

      const adbClient = new AdbServerClient(
        new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: 5037 }),
      );
      const adb = new Adb(
        await adbClient.createTransport({ serial: this.deviceId }),
      );

      const config = this.resolveConfig(deviceInfo);
      this.manager = new ScrcpyManager(adb, {
        maxSize: config.maxSize,
        videoBitRate: config.videoBitRate,
        idleTimeoutMs: config.idleTimeoutMs,
      });

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
    const screenshotBuffer = await manager.getScreenshotPng();
    return createImgBase64ByFormat('png', screenshotBuffer.toString('base64'));
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
      dpr: deviceInfo.dpr,
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
