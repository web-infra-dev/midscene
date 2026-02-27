import type { Size } from '@midscene/core';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import type { ScrcpyScreenshotManager } from './scrcpy-manager';
import { DEFAULT_SCRCPY_CONFIG } from './scrcpy-manager';

const debugAdapter = getDebug('android:scrcpy-adapter');

// Touch injection timing constants
const TOUCH_HOLD_BEFORE_MOVE_MS = 80;
const TOUCH_MOVE_INTERVAL_MS = 16; // ~60fps

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
  private initFailed = false;

  constructor(
    private deviceId: string,
    private scrcpyConfig: ScrcpyConfig | undefined,
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

      const adbClient = new AdbServerClient(
        new AdbServerNodeTcpConnector({ host: '127.0.0.1', port: 5037 }),
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

  /**
   * Perform a drag gesture via scrcpy control channel.
   * Sends touch DOWN → brief hold → MOVE events → UP.
   * Returns true if scrcpy control was used, false if not available.
   */
  async drag(
    from: { x: number; y: number },
    to: { x: number; y: number },
    screenWidth: number,
    screenHeight: number,
    duration?: number,
  ): Promise<boolean> {
    if (!this.manager || !this.manager.isConnected()) {
      debugAdapter('Scrcpy drag: manager not connected');
      return false;
    }

    const controller = this.manager.getController();
    if (!controller) {
      debugAdapter('Scrcpy drag: controller not available');
      return false;
    }

    try {
      const { AndroidMotionEventAction } = await import('@yume-chan/scrcpy');

      // Use scrcpy video resolution for screenWidth/screenHeight to ensure correct coordinate mapping.
      // The scrcpy server scales: physicalX = pointerX * videoWidth / screenWidth
      // So we must use the video resolution, and scale input coordinates accordingly.
      const videoRes = this.manager.getResolution();
      const actualScreenWidth = videoRes?.width ?? screenWidth;
      const actualScreenHeight = videoRes?.height ?? screenHeight;

      // Scale coordinates from physical space to scrcpy video space
      const scaleX =
        screenWidth !== actualScreenWidth ? actualScreenWidth / screenWidth : 1;
      const scaleY =
        screenHeight !== actualScreenHeight
          ? actualScreenHeight / screenHeight
          : 1;

      const scaledFrom = {
        x: Math.round(from.x * scaleX),
        y: Math.round(from.y * scaleY),
      };
      const scaledTo = {
        x: Math.round(to.x * scaleX),
        y: Math.round(to.y * scaleY),
      };

      if (scaleX !== 1 || scaleY !== 1) {
        console.log(
          `[midscene] Scrcpy coord scale: physical=${screenWidth}x${screenHeight}, video=${actualScreenWidth}x${actualScreenHeight}, scale=${scaleX.toFixed(3)}x${scaleY.toFixed(3)}`,
        );
      }

      const swipeDuration = duration ?? 1000;
      const pointerId = BigInt(0);
      const commonFields = {
        pointerId,
        screenWidth: actualScreenWidth,
        screenHeight: actualScreenHeight,
        actionButton: 0,
        buttons: 0,
      };

      // 1. Touch DOWN at start position
      await controller.injectTouch({
        ...commonFields,
        action: AndroidMotionEventAction.Down,
        pointerX: scaledFrom.x,
        pointerY: scaledFrom.y,
        pressure: 1.0,
      });

      // 2. Brief hold to let the target view capture the touch
      await new Promise((resolve) =>
        setTimeout(resolve, TOUCH_HOLD_BEFORE_MOVE_MS),
      );

      // 3. Send MOVE events interpolated between start and end
      const moveDuration = swipeDuration - TOUCH_HOLD_BEFORE_MOVE_MS;
      const steps = Math.max(
        1,
        Math.floor(moveDuration / TOUCH_MOVE_INTERVAL_MS),
      );

      for (let i = 1; i <= steps; i++) {
        const progress = i / steps;
        const currentX = Math.round(
          scaledFrom.x + (scaledTo.x - scaledFrom.x) * progress,
        );
        const currentY = Math.round(
          scaledFrom.y + (scaledTo.y - scaledFrom.y) * progress,
        );

        await controller.injectTouch({
          ...commonFields,
          action: AndroidMotionEventAction.Move,
          pointerX: currentX,
          pointerY: currentY,
          pressure: 1.0,
        });

        if (i < steps) {
          await new Promise((resolve) =>
            setTimeout(resolve, TOUCH_MOVE_INTERVAL_MS),
          );
        }
      }

      // 4. Touch UP at end position
      await controller.injectTouch({
        ...commonFields,
        action: AndroidMotionEventAction.Up,
        pointerX: scaledTo.x,
        pointerY: scaledTo.y,
        pressure: 0,
      });

      console.log(
        `[midscene] Scrcpy drag: (${scaledFrom.x},${scaledFrom.y}) → (${scaledTo.x},${scaledTo.y}), screen=${actualScreenWidth}x${actualScreenHeight}, duration=${swipeDuration}ms, steps=${steps}`,
      );
      return true;
    } catch (error) {
      console.warn(`[midscene] Scrcpy touch injection failed: ${error}`);
      return false;
    }
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
