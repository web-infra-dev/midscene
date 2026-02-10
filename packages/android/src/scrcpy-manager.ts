import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { getDebug } from '@midscene/shared/logger';
import type { Adb } from '@yume-chan/adb';

const debugScrcpy = getDebug('android:scrcpy');

// H.264 NAL unit types
const NAL_TYPE_IDR = 5; // IDR slice (keyframe/I-frame)
const NAL_TYPE_SPS = 7; // Sequence Parameter Set
const NAL_TYPE_PPS = 8; // Picture Parameter Set
const NAL_TYPE_MASK = 0x1f; // Lower 5 bits

// Configuration defaults
const DEFAULT_MAX_SIZE = 0; // 0 = no scaling, keep original resolution
const DEFAULT_VIDEO_BIT_RATE = 100_000_000; // 100Mbps - high quality all-I-frame over local ADB
const MAX_VIDEO_BIT_RATE = 100_000_000; // Safe upper limit for Android H.264 hardware encoders
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;

// Timeouts and limits
const MAX_KEYFRAME_WAIT_MS = 5_000;
const FRESH_FRAME_TIMEOUT_MS = 300; // Short timeout to wait for a fresh frame; fallback to cached frame if screen is static
const KEYFRAME_POLL_INTERVAL_MS = 200;
const MAX_SCAN_BYTES = 1_000;
const CONNECTION_WAIT_MS = 1_000;

// Scrcpy default configuration (disabled by default, opt-in via scrcpyConfig.enabled)
export const DEFAULT_SCRCPY_CONFIG = {
  enabled: false,
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
  private spsHeader: Buffer | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isInitialized = false;
  private options: ResolvedScrcpyOptions;
  private ffmpegAvailable: boolean | null = null;
  private keyframeResolvers: Array<(buf: Buffer) => void> = [];
  private lastRawKeyframe: Buffer | null = null;
  private videoResolution: { width: number; height: number } | null = null;
  private streamReader: any = null;

  constructor(adb: Adb, options: ScrcpyScreenshotOptions = {}) {
    this.adb = adb;
    const requestedBitRate = options.videoBitRate ?? DEFAULT_VIDEO_BIT_RATE;
    this.options = {
      maxSize: options.maxSize ?? DEFAULT_MAX_SIZE,
      videoBitRate: Math.min(requestedBitRate, MAX_VIDEO_BIT_RATE),
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
      const { ScrcpyOptions3_1, DefaultServerPath } = await import(
        '@yume-chan/scrcpy'
      );

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
        maxFps: 10,
        sendFrameMeta: true,
        videoCodecOptions: 'i-frame-interval=0,bitrate-mode=2',
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
    const androidPkgJson = createRequire(import.meta.url).resolve(
      '@midscene/android/package.json',
    );
    return path.join(path.dirname(androidPkgJson), 'bin', 'scrcpy-server');
  }

  /**
   * Get ffmpeg executable path
   * Priority: @ffmpeg-installer/ffmpeg > system ffmpeg
   */
  private getFfmpegPath(): string {
    try {
      // Try npm-installed ffmpeg first
      // Use createRequire to dynamically load optional dependency
      // This ensures the require happens at runtime, not bundle time
      const dynamicRequire = createRequire(import.meta.url);
      const ffmpegInstaller = dynamicRequire('@ffmpeg-installer/ffmpeg');
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
    this.streamReader = reader;
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
   * Process a single video packet from the scrcpy stream.
   * With sendFrameMeta: true, the stream emits properly framed packets:
   * - "configuration" packets contain SPS/PPS header data
   * - "data" packets contain complete video frames with correct boundaries
   * This avoids the frame-splitting issue that occurs with sendFrameMeta: false
   * at high resolutions where raw chunks may not align with frame boundaries.
   */
  private processFrame(packet: any): void {
    if (packet.type === 'configuration') {
      // Configuration packet contains SPS/PPS in Annex B format
      this.spsHeader = Buffer.from(packet.data);
      debugScrcpy(`Received SPS/PPS configuration: ${this.spsHeader.length}B`);
      return;
    }

    // Data packet - each packet is a complete frame
    const frameBuffer = Buffer.from(packet.data);
    const isKeyFrame = detectH264KeyFrame(frameBuffer);

    if (isKeyFrame && this.spsHeader) {
      this.lastRawKeyframe = frameBuffer;
      if (this.keyframeResolvers.length > 0) {
        const combined = Buffer.concat([this.spsHeader, frameBuffer]);
        this.notifyKeyframeWaiters(combined);
      }
    }
  }

  /**
   * Get screenshot as JPEG.
   * Tries to get a fresh frame within a short timeout. If the screen is static
   * (no new frames arrive), falls back to the latest cached keyframe.
   */
  async getScreenshotJpeg(): Promise<Buffer> {
    const perfStart = Date.now();

    const t1 = Date.now();
    await this.ensureConnected();
    const connectTime = Date.now() - t1;

    const t2 = Date.now();
    await this.waitForKeyframe();
    const spsWaitTime = Date.now() - t2;

    const t3 = Date.now();
    let keyframeBuffer: Buffer;
    let frameSource: string;
    try {
      keyframeBuffer = await this.waitForNextKeyframe(FRESH_FRAME_TIMEOUT_MS);
      frameSource = 'fresh';
    } catch {
      // No fresh frame within timeout — screen is likely static, use cached frame
      if (this.lastRawKeyframe && this.spsHeader) {
        keyframeBuffer = Buffer.concat([this.spsHeader, this.lastRawKeyframe]);
        frameSource = 'cached';
      } else {
        // No cached frame either, wait longer
        keyframeBuffer = await this.waitForNextKeyframe(MAX_KEYFRAME_WAIT_MS);
        frameSource = 'fresh-retry';
      }
    }
    const frameWaitTime = Date.now() - t3;

    this.resetIdleTimer();

    debugScrcpy(
      `Decoding H.264 stream: ${keyframeBuffer.length} bytes (${frameSource})`,
    );

    const t4 = Date.now();
    const result = await this.decodeH264ToJpeg(keyframeBuffer);
    const decodeTime = Date.now() - t4;

    const totalTime = Date.now() - perfStart;
    debugScrcpy(
      `Performance: total=${totalTime}ms (connect=${connectTime}ms, spsWait=${spsWaitTime}ms, frameWait=${frameWaitTime}ms[${frameSource}], decode=${decodeTime}ms)`,
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
   * Notify all pending keyframe waiters
   */
  private notifyKeyframeWaiters(buf: Buffer): void {
    const resolvers = this.keyframeResolvers;
    this.keyframeResolvers = [];
    for (const resolve of resolvers) {
      resolve(buf);
    }
  }

  /**
   * Wait for the next keyframe to arrive
   */
  private waitForNextKeyframe(timeoutMs: number): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const wrappedResolve = (buf: Buffer) => {
        clearTimeout(timer);
        resolve(buf);
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
   * Decode H.264 data to JPEG using ffmpeg
   */
  private async decodeH264ToJpeg(h264Buffer: Buffer): Promise<Buffer> {
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
        'mjpeg',
        '-q:v',
        '5',
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
          const jpegBuffer = Buffer.concat(chunks);
          debugScrcpy(
            `FFmpeg decode successful, JPEG size: ${jpegBuffer.length} bytes`,
          );
          resolve(jpegBuffer);
        } else {
          const errorMsg = stderrOutput || `FFmpeg exited with code ${code}`;
          debugScrcpy(`FFmpeg decode failed: ${errorMsg}`);
          reject(new Error(`H.264 to JPEG decode failed: ${errorMsg}`));
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

    // Capture references before nulling — prevents race with ensureConnected
    const client = this.scrcpyClient;
    const reader = this.streamReader;

    this.scrcpyClient = null;
    this.videoStream = null;
    this.streamReader = null;
    this.spsHeader = null;
    this.lastRawKeyframe = null;
    this.isInitialized = false;
    this.keyframeResolvers = [];

    // Cancel reader first to stop consumeFramesLoop
    if (reader) {
      try {
        reader.cancel();
      } catch {}
    }

    // Then close the client
    if (client) {
      try {
        await client.close();
      } catch (error) {
        debugScrcpy(`Error closing scrcpy client: ${error}`);
      }
    }

    debugScrcpy('Scrcpy disconnected');
  }

  /**
   * Check if scrcpy is initialized and connected
   */
  isConnected(): boolean {
    return this.isInitialized && this.scrcpyClient !== null;
  }
}
