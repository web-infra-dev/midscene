import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDebug } from '@midscene/shared/logger';
import type { Adb } from '@yume-chan/adb';

const debugScrcpy = getDebug('android:scrcpy');

// H.264 NAL unit types
const NAL_TYPE_IDR = 5; // IDR slice (keyframe/I-frame)
const NAL_TYPE_SPS = 7; // Sequence Parameter Set
const NAL_TYPE_PPS = 8; // Picture Parameter Set
const NAL_TYPE_MASK = 0x1f; // Lower 5 bits

// H.264 start codes
const START_CODE_4_BYTE = Buffer.from([0x00, 0x00, 0x00, 0x01]);

// Configuration defaults
const DEFAULT_MAX_SIZE = 0; // 0 = no scaling, keep original resolution
const DEFAULT_VIDEO_BIT_RATE = 2_000_000; // 2Mbps - balanced quality and performance
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;

// Timeouts and limits
const MAX_KEYFRAME_WAIT_MS = 5_000;
const KEYFRAME_POLL_INTERVAL_MS = 200;
const FRAME_AGE_WARNING_THRESHOLD_MS = 1_000;
const FRAME_AGE_PNG_WARNING_THRESHOLD_MS = 2_000;
const FRESH_FRAME_WAIT_TIMEOUT_MS = 3_000;
const MAX_RECENT_FRAMES = 10;
const MAX_SCAN_BYTES = 1_000;
const CONNECTION_WAIT_MS = 1_000;
const FRAME_LOG_INTERVAL = 20;

// Scrcpy default configuration (默认启用,自动 fallback)
export const DEFAULT_SCRCPY_CONFIG = {
  enabled: true, // 默认启用,失败时自动降级到 ADB
  maxSize: DEFAULT_MAX_SIZE,
  idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
  videoBitRate: DEFAULT_VIDEO_BIT_RATE,
} as const;

export interface ScrcpyScreenshotOptions {
  maxSize?: number;
  videoBitRate?: number;
  idleTimeoutMs?: number;
}

/**
 * Check if NAL unit type indicates a keyframe (IDR, SPS, or PPS)
 */
function isKeyFrameNalType(nalUnitType: number): boolean {
  return (
    nalUnitType === NAL_TYPE_IDR ||
    nalUnitType === NAL_TYPE_SPS ||
    nalUnitType === NAL_TYPE_PPS
  );
}

/**
 * Detect if H.264 frame contains keyframe (IDR) or SPS/PPS
 * Scans for H.264 start codes (0x00 0x00 0x00 0x01 or 0x00 0x00 0x01)
 */
function detectH264KeyFrame(buffer: Buffer): boolean {
  const scanLimit = Math.min(buffer.length - 4, MAX_SCAN_BYTES);

  for (let i = 0; i < scanLimit; i++) {
    // Check for 4-byte start code: 0x00 0x00 0x00 0x01
    if (
      buffer[i] === 0x00 &&
      buffer[i + 1] === 0x00 &&
      buffer[i + 2] === 0x00 &&
      buffer[i + 3] === 0x01
    ) {
      const nalUnitType = buffer[i + 4] & NAL_TYPE_MASK;
      if (isKeyFrameNalType(nalUnitType)) {
        return true;
      }
    }
    // Check for 3-byte start code: 0x00 0x00 0x01
    else if (
      buffer[i] === 0x00 &&
      buffer[i + 1] === 0x00 &&
      buffer[i + 2] === 0x01
    ) {
      const nalUnitType = buffer[i + 3] & NAL_TYPE_MASK;
      if (isKeyFrameNalType(nalUnitType)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Required options after applying defaults
 */
interface ResolvedScrcpyOptions {
  maxSize: number;
  videoBitRate: number;
  idleTimeoutMs: number;
}

export class ScrcpyScreenshotManager {
  private adb: Adb;
  // Using 'any' for external library types to avoid type compatibility issues
  private scrcpyClient: any = null;
  private videoStream: any = null;
  private lastFrameBuffer: Buffer | null = null;
  private lastFrameTimestamp = 0;
  private spsHeader: Buffer | null = null;
  private latestFrameBuffer: Buffer | null = null;
  private latestFrameTimestamp = 0;
  private idleTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isInitialized = false;
  private options: ResolvedScrcpyOptions;
  private ffmpegAvailable: boolean | null = null;
  private recentFrames: Buffer[] = [];
  private frameResolvers: Array<() => void> = [];
  private keyframeResolvers: Array<() => void> = [];
  private videoResolution: { width: number; height: number } | null = null;
  private h264SearchConfigFn: ((data: Uint8Array) => any) | null = null;

  constructor(adb: Adb, options: ScrcpyScreenshotOptions = {}) {
    this.adb = adb;
    this.options = {
      maxSize: options.maxSize ?? DEFAULT_MAX_SIZE,
      videoBitRate: options.videoBitRate ?? DEFAULT_VIDEO_BIT_RATE,
      idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
    };
  }

  /**
   * Validate environment prerequisites (ffmpeg, scrcpy-server, etc.)
   * Must be called once after construction, before any screenshot operations.
   * Throws if prerequisites are not met.
   */
  async validateEnvironment(): Promise<void> {
    await this.ensureFfmpegAvailable();
  }

  /**
   * Ensure scrcpy connection is active
   */
  async ensureConnected(): Promise<void> {
    if (this.scrcpyClient && this.videoStream) {
      debugScrcpy('Scrcpy already connected');
      this.resetIdleTimer();
      return;
    }

    if (this.isConnecting) {
      debugScrcpy('Connection already in progress, waiting...');
      await new Promise((resolve) => setTimeout(resolve, CONNECTION_WAIT_MS));
      // After waiting, check if the other connection attempt succeeded
      if (this.scrcpyClient && this.videoStream) {
        this.resetIdleTimer();
        return;
      }
      throw new Error(
        'Scrcpy connection failed: another connection attempt did not complete in time',
      );
    }

    try {
      this.isConnecting = true;
      debugScrcpy('Starting scrcpy connection...');

      const { AdbScrcpyClient, AdbScrcpyOptions2_1 } = await import(
        '@yume-chan/adb-scrcpy'
      );
      const { ReadableStream } = await import('@yume-chan/stream-extra');
      const { ScrcpyOptions3_1, DefaultServerPath, h264SearchConfiguration } =
        await import('@yume-chan/scrcpy');

      // Cache h264SearchConfiguration for synchronous use in processFrame
      this.h264SearchConfigFn = h264SearchConfiguration;

      // Use local scrcpy-server file
      const serverBinPath = this.resolveServerBinPath();
      await AdbScrcpyClient.pushServer(
        this.adb,
        ReadableStream.from(createReadStream(serverBinPath)),
      );

      const scrcpyOptions = new ScrcpyOptions3_1({
        audio: false,
        control: false,
        maxSize: this.options.maxSize,
        videoBitRate: this.options.videoBitRate,
        sendFrameMeta: false,
      });

      this.scrcpyClient = await AdbScrcpyClient.start(
        this.adb,
        DefaultServerPath,
        new AdbScrcpyOptions2_1(scrcpyOptions),
      );

      const videoStreamPromise = this.scrcpyClient.videoStream;
      if (!videoStreamPromise) {
        throw new Error('Scrcpy client did not provide video stream');
      }
      this.videoStream = await videoStreamPromise;
      const { width = 0, height = 0 } = this.videoStream.metadata;
      debugScrcpy(`Video stream started: ${width}x${height}`);

      // Store the actual video resolution
      this.videoResolution = { width, height };

      this.startFrameConsumer();
      this.resetIdleTimer();
      this.isInitialized = true;

      debugScrcpy('Scrcpy connection established');
    } catch (error) {
      debugScrcpy(`Failed to connect scrcpy: ${error}`);
      await this.disconnect();
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Resolve path to scrcpy server binary
   */
  private resolveServerBinPath(): string {
    const currentDir =
      typeof __dirname !== 'undefined'
        ? __dirname
        : path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(currentDir, '../../bin/scrcpy-server');
  }

  /**
   * Get ffmpeg executable path
   * Priority: @ffmpeg-installer/ffmpeg > system ffmpeg
   */
  private getFfmpegPath(): string {
    try {
      // Try npm-installed ffmpeg first
      const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
      debugScrcpy(`Using ffmpeg from npm package: ${ffmpegInstaller.path}`);
      return ffmpegInstaller.path;
    } catch (error) {
      debugScrcpy('Using system ffmpeg (npm package not found)');
      return 'ffmpeg'; // Fallback to system ffmpeg
    }
  }

  /**
   * Consume video frames and keep latest frame
   */
  private startFrameConsumer(): void {
    if (!this.videoStream) return;

    const reader = this.videoStream.stream.getReader();
    this.consumeFramesLoop(reader);
  }

  /**
   * Main frame consumption loop
   */
  private async consumeFramesLoop(reader: any): Promise<void> {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        this.processFrame(value);
      }
    } catch (error) {
      debugScrcpy(`Frame consumer error: ${error}`);
      await this.disconnect();
    }
  }

  /**
   * Process a single video frame
   */
  private processFrame(packet: any): void {
    const frameBuffer = Buffer.from(packet.data);
    const reportedKeyFrame = packet.keyframe ?? false;
    const actualKeyFrame = detectH264KeyFrame(frameBuffer);

    this.lastFrameBuffer = frameBuffer;
    this.lastFrameTimestamp = Date.now();
    this.notifyFrameWaiters();

    if (actualKeyFrame && !this.spsHeader) {
      this.extractSpsHeader(frameBuffer);
    }

    if (actualKeyFrame && this.spsHeader) {
      this.latestFrameBuffer = Buffer.concat([this.spsHeader, frameBuffer]);
      this.latestFrameTimestamp = Date.now();
      this.notifyKeyframeWaiters();
      debugScrcpy(
        `Updated frame buffer: config=${this.spsHeader.length}B + keyframe=${frameBuffer.length}B = ${this.latestFrameBuffer.length}B`,
      );
    }

    this.updateRecentFrames(frameBuffer);
    this.logFrameIfNeeded(frameBuffer, actualKeyFrame, reportedKeyFrame);
  }

  /**
   * Extract SPS/PPS header from keyframe
   */
  private extractSpsHeader(frameBuffer: Buffer): void {
    if (!this.h264SearchConfigFn) return;
    try {
      const config = this.h264SearchConfigFn(new Uint8Array(frameBuffer));
      if (!config.sequenceParameterSet || !config.pictureParameterSet) {
        return;
      }

      this.spsHeader = Buffer.concat([
        START_CODE_4_BYTE,
        Buffer.from(config.sequenceParameterSet),
        START_CODE_4_BYTE,
        Buffer.from(config.pictureParameterSet),
      ]);

      debugScrcpy(
        `Extracted SPS/PPS: SPS=${config.sequenceParameterSet.length}B, PPS=${config.pictureParameterSet.length}B, total=${this.spsHeader.length}B`,
      );
    } catch (error) {
      debugScrcpy(`Failed to extract SPS/PPS from keyframe: ${error}`);
    }
  }

  /**
   * Update recent frames buffer with size limit
   */
  private updateRecentFrames(frameBuffer: Buffer): void {
    this.recentFrames.push(frameBuffer);
    if (this.recentFrames.length > MAX_RECENT_FRAMES) {
      this.recentFrames.shift();
    }
  }

  /**
   * Log frame information for debugging (keyframes and periodic frames)
   */
  private logFrameIfNeeded(
    frameBuffer: Buffer,
    actualKeyFrame: boolean,
    reportedKeyFrame: boolean,
  ): void {
    const shouldLog =
      actualKeyFrame || this.recentFrames.length % FRAME_LOG_INTERVAL === 0;
    if (!shouldLog) return;

    debugScrcpy(
      `Frame: ${frameBuffer.length} bytes, keyFrame=${actualKeyFrame} (reported=${reportedKeyFrame}), hasConfig=${!!this.spsHeader}, recentFrames=${this.recentFrames.length}`,
    );
  }

  /**
   * Get current screenshot from video stream
   * Returns raw H.264 encoded data
   */
  async getScreenshot(): Promise<Buffer> {
    await this.ensureConnected();

    const frameAge = this.lastFrameBuffer
      ? Date.now() - this.lastFrameTimestamp
      : Number.POSITIVE_INFINITY;

    if (!this.lastFrameBuffer || frameAge > FRAME_AGE_WARNING_THRESHOLD_MS) {
      debugScrcpy(
        `Frame is stale or missing (${frameAge}ms old), waiting for fresh frame...`,
      );
      await this.waitForNextFrame(FRESH_FRAME_WAIT_TIMEOUT_MS);
    }

    if (!this.lastFrameBuffer) {
      throw new Error(
        'No frame available after waiting. The video stream may have disconnected.',
      );
    }

    this.resetIdleTimer();
    return this.lastFrameBuffer;
  }

  /**
   * Get screenshot as PNG
   * Decodes H.264 video stream to PNG using ffmpeg
   */
  async getScreenshotPng(): Promise<Buffer> {
    const perfStart = Date.now();

    const t1 = Date.now();
    await this.ensureConnected();
    const connectTime = Date.now() - t1;

    const t3 = Date.now();
    await this.waitForKeyframe();
    const keyframeWaitTime = Date.now() - t3;

    const keyframeAge = this.latestFrameBuffer
      ? Date.now() - this.latestFrameTimestamp
      : Number.POSITIVE_INFINITY;

    if (
      !this.latestFrameBuffer ||
      keyframeAge > FRAME_AGE_PNG_WARNING_THRESHOLD_MS
    ) {
      debugScrcpy(
        `Keyframe is stale or missing (${keyframeAge}ms old), waiting for fresh keyframe...`,
      );
      await this.waitForNextKeyframe(MAX_KEYFRAME_WAIT_MS);
    }

    if (!this.latestFrameBuffer) {
      throw new Error(
        'No decodable frames available. Keyframe may not have been captured yet.',
      );
    }

    this.resetIdleTimer();

    debugScrcpy(
      `Decoding H.264 stream: ${this.latestFrameBuffer.length} bytes (header: ${this.spsHeader?.length ?? 0}, recent: ${this.recentFrames.length} frames)`,
    );

    const t4 = Date.now();
    const result = await this.decodeH264ToPng(this.latestFrameBuffer);
    const decodeTime = Date.now() - t4;

    const totalTime = Date.now() - perfStart;
    debugScrcpy(
      `Performance: total=${totalTime}ms (connect=${connectTime}ms, keyframeWait=${keyframeWaitTime}ms, decode=${decodeTime}ms)`,
    );

    return result;
  }

  /**
   * Get the actual video stream resolution
   * Returns null if scrcpy is not connected yet
   */
  getResolution(): { width: number; height: number } | null {
    return this.videoResolution;
  }

  /**
   * Notify all pending frame waiters
   */
  private notifyFrameWaiters(): void {
    const resolvers = this.frameResolvers;
    this.frameResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }
  }

  /**
   * Notify all pending keyframe waiters
   */
  private notifyKeyframeWaiters(): void {
    const resolvers = this.keyframeResolvers;
    this.keyframeResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }
  }

  /**
   * Wait for the next frame to arrive
   */
  private waitForNextFrame(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const wrappedResolve = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.frameResolvers = this.frameResolvers.filter(
          (r) => r !== wrappedResolve,
        );
        reject(new Error(`No fresh frame received within ${timeoutMs}ms`));
      }, timeoutMs);
      this.frameResolvers.push(wrappedResolve);
    });
  }

  /**
   * Wait for the next keyframe to arrive
   */
  private waitForNextKeyframe(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const wrappedResolve = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.keyframeResolvers = this.keyframeResolvers.filter(
          (r) => r !== wrappedResolve,
        );
        reject(new Error(`No fresh keyframe received within ${timeoutMs}ms`));
      }, timeoutMs);
      this.keyframeResolvers.push(wrappedResolve);
    });
  }

  /**
   * Ensure ffmpeg is available for PNG conversion
   */
  private async ensureFfmpegAvailable(): Promise<void> {
    if (this.ffmpegAvailable !== null) return;

    try {
      this.ffmpegAvailable = await this.checkFfmpegAvailable();
      if (!this.ffmpegAvailable) {
        debugScrcpy(
          'Warning: ffmpeg is not available. Scrcpy screenshot will be disabled.\n' +
            'To enable high-performance screenshots:\n' +
            '  1. Install optional dependency: pnpm add -D @ffmpeg-installer/ffmpeg\n' +
            '  2. Or install system ffmpeg: https://ffmpeg.org',
        );
      }
    } catch (error) {
      this.ffmpegAvailable = false;
      debugScrcpy(`Error checking ffmpeg availability: ${error}`);
    }

    if (!this.ffmpegAvailable) {
      throw new Error(
        'ffmpeg is not available, please use standard ADB screenshot mode',
      );
    }
  }

  /**
   * Wait for first keyframe with SPS/PPS header
   */
  private async waitForKeyframe(): Promise<void> {
    const startTime = Date.now();

    while (!this.spsHeader && Date.now() - startTime < MAX_KEYFRAME_WAIT_MS) {
      const elapsed = Date.now() - startTime;
      debugScrcpy(
        `Waiting for first keyframe (SPS/PPS header)... ${elapsed}ms`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, KEYFRAME_POLL_INTERVAL_MS),
      );
    }

    if (!this.spsHeader) {
      throw new Error(
        `No keyframe received within ${MAX_KEYFRAME_WAIT_MS}ms. Device may have a long GOP interval or video encoding issues. Please retry.`,
      );
    }
  }

  /**
   * Check if ffmpeg is available in the system
   */
  private async checkFfmpegAvailable(): Promise<boolean> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    try {
      const ffmpegPath = this.getFfmpegPath();
      await execFileAsync(ffmpegPath, ['-version']);
      debugScrcpy(`ffmpeg is available at: ${ffmpegPath}`);
      return true;
    } catch (error) {
      debugScrcpy(`ffmpeg is not available: ${error}`);
      return false;
    }
  }

  /**
   * Decode H.264 data to PNG using ffmpeg
   */
  private async decodeH264ToPng(h264Buffer: Buffer): Promise<Buffer> {
    const { spawn } = await import('node:child_process');

    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-f',
        'h264',
        '-i',
        'pipe:0',
        '-vframes',
        '1',
        '-f',
        'image2pipe',
        '-vcodec',
        'png',
        '-loglevel',
        'error',
        'pipe:1',
      ];

      const ffmpegPath = this.getFfmpegPath();
      const ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const chunks: Buffer[] = [];
      let stderrOutput = '';

      ffmpeg.stdout.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      ffmpeg.stderr.on('data', (data: Buffer) => {
        stderrOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0 && chunks.length > 0) {
          const pngBuffer = Buffer.concat(chunks);
          debugScrcpy(
            `FFmpeg decode successful, PNG size: ${pngBuffer.length} bytes`,
          );
          resolve(pngBuffer);
        } else {
          const errorMsg = stderrOutput || `FFmpeg exited with code ${code}`;
          debugScrcpy(`FFmpeg decode failed: ${errorMsg}`);
          reject(new Error(`H.264 to PNG decode failed: ${errorMsg}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`Failed to spawn ffmpeg process: ${error.message}`));
      });

      ffmpeg.stdin.write(h264Buffer);
      ffmpeg.stdin.end();
    });
  }

  /**
   * Reset idle timeout timer
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    if (!this.options.idleTimeoutMs) return;

    this.idleTimer = setTimeout(() => {
      debugScrcpy('Idle timeout reached, disconnecting scrcpy');
      this.disconnect();
    }, this.options.idleTimeoutMs);
  }

  /**
   * Disconnect scrcpy
   */
  async disconnect(): Promise<void> {
    debugScrcpy('Disconnecting scrcpy...');

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.scrcpyClient) {
      try {
        await this.scrcpyClient.close();
      } catch (error) {
        debugScrcpy(`Error closing scrcpy client: ${error}`);
      }
      this.scrcpyClient = null;
    }

    this.videoStream = null;
    this.lastFrameBuffer = null;
    this.lastFrameTimestamp = 0;
    this.spsHeader = null;
    this.latestFrameBuffer = null;
    this.latestFrameTimestamp = 0;
    this.recentFrames = [];
    this.isInitialized = false;
    this.h264SearchConfigFn = null;

    for (const resolve of this.frameResolvers) {
      resolve();
    }
    this.frameResolvers = [];
    for (const resolve of this.keyframeResolvers) {
      resolve();
    }
    this.keyframeResolvers = [];

    debugScrcpy('Scrcpy disconnected');
  }

  /**
   * Check if scrcpy is initialized and connected
   */
  isConnected(): boolean {
    return this.isInitialized && this.scrcpyClient !== null;
  }
}
