import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { getDebug } from '@midscene/shared/logger';
import type { Adb } from '@yume-chan/adb';

const debugScrcpy = getDebug('android:scrcpy');
const warnScrcpy = getDebug('android:scrcpy', { console: true });

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
const MAX_SERVER_OUTPUT_LINES = 100;
const SERVER_OUTPUT_DRAIN_TIMEOUT_MS = 500;

// Busy-loop detection thresholds
const BUSY_LOOP_WINDOW_MS = 1_000; // Sliding window for measuring frame rate
const BUSY_LOOP_MAX_READS = 500; // Max reads per window before considered busy-loop
const BUSY_LOOP_COOLDOWN_MS = 50; // Throttle delay when busy-loop detected
const BUSY_LOOP_WARN_INTERVAL_MS = 5_000; // Min interval between busy-loop warnings

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
 * A raw (not yet decoded) H.264 keyframe emitted by the scrcpy stream.
 * Holding these is cheap — decoding to WebP costs an ffmpeg run per frame, so
 * consumers (e.g. UI observers) buffer raw keyframes and decode only
 * the frames they actually need, after sampling.
 */
export interface RawKeyframe {
  /** Raw H.264 keyframe data WITHOUT the SPS/PPS header. */
  data: Buffer;
  /** SPS/PPS header active when this frame was produced (needed to decode). */
  header: Buffer;
  capturedAt: number;
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
  private keyframeListeners = new Set<(frame: RawKeyframe) => void>();
  private lastRawKeyframe: Buffer | null = null;
  private lastRawKeyframeAt = 0;
  private videoResolution: { width: number; height: number } | null = null;
  private streamReader: any = null;

  constructor(adb: Adb, options: ScrcpyScreenshotOptions = {}) {
    this.adb = adb;
    const requestedBitRate = options.videoBitRate ?? DEFAULT_VIDEO_BIT_RATE;
    const clampedBitRate = Math.min(requestedBitRate, MAX_VIDEO_BIT_RATE);
    if (requestedBitRate > MAX_VIDEO_BIT_RATE) {
      warnScrcpy(
        `videoBitRate ${requestedBitRate} exceeds maximum ${MAX_VIDEO_BIT_RATE}, clamped to ${clampedBitRate}`,
      );
    }
    this.options = {
      maxSize: options.maxSize ?? DEFAULT_MAX_SIZE,
      videoBitRate: clampedBitRate,
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

    const serverOutput: string[] = [];
    let serverOutputTask: Promise<void> | null = null;

    try {
      this.isConnecting = true;
      debugScrcpy('Starting scrcpy connection...');

      const { AdbScrcpyClient, AdbScrcpyOptions3_3_3 } = await import(
        '@yume-chan/adb-scrcpy'
      );
      const { ReadableStream } = await import('@yume-chan/stream-extra');
      const { DefaultServerPath } = await import('@yume-chan/scrcpy');

      // Use local scrcpy-server file
      const serverBinPath = this.resolveServerBinPath();
      await AdbScrcpyClient.pushServer(
        this.adb,
        ReadableStream.from(createReadStream(serverBinPath)),
      );

      const scrcpyOptions = new AdbScrcpyOptions3_3_3({
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
        scrcpyOptions,
      );
      serverOutputTask = this.collectServerOutput(
        this.scrcpyClient.output,
        serverOutput,
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
      if (serverOutputTask) {
        await Promise.race([
          serverOutputTask,
          new Promise<void>((resolve) =>
            setTimeout(resolve, SERVER_OUTPUT_DRAIN_TIMEOUT_MS),
          ),
        ]);
      }
      throw this.createConnectionError(error, serverOutput);
    } finally {
      this.isConnecting = false;
    }
  }

  private async collectServerOutput(
    output: ReadableStream<string>,
    lines: string[],
  ): Promise<void> {
    const reader = output.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lines.push(value);
        if (lines.length > MAX_SERVER_OUTPUT_LINES) {
          lines.splice(0, lines.length - MAX_SERVER_OUTPUT_LINES);
        }
      }
    } catch (error) {
      debugScrcpy(`Failed to read scrcpy server output: ${error}`);
    } finally {
      reader.releaseLock();
    }
  }

  private createConnectionError(error: unknown, serverOutput: string[]): Error {
    const errorOutput = this.getErrorOutput(error);
    const output = [...new Set([...errorOutput, ...serverOutput])].filter(
      (line) => line.trim().length > 0,
    );
    const message = error instanceof Error ? error.message : String(error);
    const outputDetails =
      output.length > 0 ? `\nScrcpy server output:\n${output.join('\n')}` : '';

    return new Error(`Failed to connect scrcpy: ${message}${outputDetails}`, {
      cause: error,
    });
  }

  private getErrorOutput(error: unknown): string[] {
    if (typeof error !== 'object' || error === null || !('output' in error)) {
      return [];
    }

    const output = (error as { output?: unknown }).output;
    if (!Array.isArray(output)) {
      return [];
    }

    return output.filter((line): line is string => typeof line === 'string');
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
   * Includes busy-loop detection: if reader.read() resolves too fast
   * (e.g. broken stream returning immediately), we throttle to prevent 100% CPU.
   */
  private async consumeFramesLoop(reader: any): Promise<void> {
    let readCount = 0;
    let windowStart = Date.now();
    let lastBusyWarn = 0;
    let totalReads = 0;
    let endReason = 'stream closed';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalReads++;
        readCount++;

        // Busy-loop detection: check reads per sliding window
        const now = Date.now();
        const elapsed = now - windowStart;
        if (elapsed >= BUSY_LOOP_WINDOW_MS) {
          const readsPerSec = (readCount / elapsed) * 1000;
          if (readCount > BUSY_LOOP_MAX_READS) {
            // Only warn at throttled interval to avoid log spam
            if (now - lastBusyWarn >= BUSY_LOOP_WARN_INTERVAL_MS) {
              warnScrcpy(
                `[CPU-DIAG] Possible busy loop detected! ${readCount} reads in ${elapsed}ms (${readsPerSec.toFixed(0)} reads/sec). ` +
                  `Total reads: ${totalReads}. Throttling with ${BUSY_LOOP_COOLDOWN_MS}ms delay.`,
              );
              lastBusyWarn = now;
            }
            // Throttle: yield control to prevent CPU spin
            await new Promise((resolve) =>
              setTimeout(resolve, BUSY_LOOP_COOLDOWN_MS),
            );
          } else {
            debugScrcpy(
              `[CPU-DIAG] Frame loop stats: ${readCount} reads in ${elapsed}ms (${readsPerSec.toFixed(1)} reads/sec), total: ${totalReads}`,
            );
          }
          // Reset window
          readCount = 0;
          windowStart = Date.now();
        }

        this.processFrame(value);
      }
    } catch (error) {
      endReason = 'stream error';
      debugScrcpy(
        `Frame consumer error (total reads: ${totalReads}): ${error}`,
      );
    }

    // Only tear down the session that owns this reader. An obsolete reader can
    // finish after disconnect() has already cleared it or a reconnect has
    // installed a replacement reader.
    if (this.streamReader === reader) {
      await this.disconnect();
    }
    debugScrcpy(
      `Frame consumer loop ended (${endReason}, total reads: ${totalReads})`,
    );
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
      this.lastRawKeyframeAt = Date.now();
      if (this.keyframeResolvers.length > 0) {
        const combined = Buffer.concat([this.spsHeader, frameBuffer]);
        this.notifyKeyframeWaiters(combined);
      }
      if (this.keyframeListeners.size > 0) {
        const frame: RawKeyframe = {
          data: frameBuffer,
          header: this.spsHeader,
          capturedAt: this.lastRawKeyframeAt,
        };
        for (const listener of this.keyframeListeners) {
          try {
            listener(frame);
          } catch (error) {
            debugScrcpy(`keyframe listener error: ${error}`);
          }
        }
        // An active subscriber is consuming the stream (e.g. a UIObserver
        // capture) — keep the connection alive for the whole window.
        this.resetIdleTimer();
      }
    }
  }

  /**
   * Subscribe to raw keyframes as they arrive from the stream. While at least
   * one subscriber is active, incoming keyframes keep resetting the idle timer
   * so the connection is not torn down mid-capture. Returns an unsubscribe fn.
   *
   * Frames are emitted RAW (no decoding). Use {@link decodeRawKeyframeToWebp}
   * on the frames you actually need — one ffmpeg run per unique frame.
   */
  subscribeKeyframes(listener: (frame: RawKeyframe) => void): () => void {
    this.keyframeListeners.add(listener);
    // listeners > 0 → resetIdleTimer skips arming the idle timer
    this.resetIdleTimer();
    return () => {
      this.keyframeListeners.delete(listener);
      // If this was the last subscriber, re-arm the idle timer so the
      // connection can be cleaned up now that nobody is consuming it.
      this.resetIdleTimer();
    };
  }

  /** Latest raw keyframe seen on the stream, or null if none yet. */
  getLatestRawKeyframe(): RawKeyframe | null {
    if (!this.lastRawKeyframe || !this.spsHeader) return null;
    return {
      data: this.lastRawKeyframe,
      header: this.spsHeader,
      capturedAt: this.lastRawKeyframeAt,
    };
  }

  /**
   * Decode a raw keyframe (from {@link subscribeKeyframes} or
   * {@link getLatestRawKeyframe}) to a WebP buffer. This is the deferred,
   * per-frame-expensive step (one ffmpeg process per call) — call it only on
   * sampled frames, never inside a capture loop.
   */
  async decodeRawKeyframeToWebp(frame: RawKeyframe): Promise<Buffer> {
    return this.decodeH264ToWebp(Buffer.concat([frame.header, frame.data]));
  }

  /**
   * Get screenshot as WebP.
   * Tries to get a fresh frame within a short timeout. If the screen is static
   * (no new frames arrive), falls back to the latest cached keyframe.
   */
  async getScreenshotWebp(): Promise<Buffer> {
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
    const result = await this.decodeH264ToWebp(keyframeBuffer);
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
   * Decode H.264 to raw RGB with ffmpeg, then encode the selected frame once
   * as WebP with Sharp. The bundled ffmpeg does not include libwebp.
   */
  private async decodeH264ToWebp(h264Buffer: Buffer): Promise<Buffer> {
    const { spawn } = await import('node:child_process');
    const { default: sharp } = await import('sharp');
    const resolution = this.videoResolution;
    if (!resolution?.width || !resolution.height) {
      throw new Error(
        'Cannot decode scrcpy frame before video resolution is known',
      );
    }

    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-f',
        'h264',
        '-i',
        'pipe:0',
        '-vframes',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-loglevel',
        'error',
        'pipe:1',
      ];

      const ffmpegPath = this.getFfmpegPath();
      const ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderrOutput = '';
      let settled = false;

      const encoder = sharp({
        raw: {
          width: resolution.width,
          height: resolution.height,
          channels: 3,
        },
      }).webp({ quality: 90, effort: 1 });
      // Resolve failures into a value immediately so an ffmpeg spawn/exit
      // failure cannot leave Sharp with a temporarily unhandled rejection.
      const encodedWebpResult = encoder.toBuffer().then(
        (buffer) => ({ ok: true as const, buffer }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      ffmpeg.stdout.pipe(encoder);

      ffmpeg.stderr.on('data', (data: Buffer) => {
        stderrOutput += data.toString();
      });

      ffmpeg.on('close', async (code) => {
        if (settled) return;
        if (code !== 0) {
          settled = true;
          const errorMsg = stderrOutput || `FFmpeg exited with code ${code}`;
          debugScrcpy(`FFmpeg decode failed: ${errorMsg}`);
          reject(new Error(`H.264 frame decode failed: ${errorMsg}`));
          return;
        }

        try {
          const encodeResult = await encodedWebpResult;
          if (!encodeResult.ok) {
            throw encodeResult.error;
          }
          const webpBuffer = encodeResult.buffer;
          if (
            webpBuffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
            webpBuffer.subarray(8, 12).toString('ascii') !== 'WEBP'
          ) {
            throw new Error('Sharp returned invalid WebP bytes');
          }
          settled = true;
          debugScrcpy(
            `H.264 decode and WebP encode successful, WebP size: ${webpBuffer.length} bytes`,
          );
          resolve(webpBuffer);
        } catch (error) {
          settled = true;
          reject(
            new Error(
              `H.264 to WebP encode failed: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      });

      ffmpeg.on('error', (error) => {
        if (settled) return;
        settled = true;
        reject(new Error(`Failed to spawn ffmpeg process: ${error.message}`));
      });

      ffmpeg.stdin.write(h264Buffer);
      ffmpeg.stdin.end();
    });
  }

  /**
   * Reset idle timeout timer. While keyframe subscribers are active
   * (e.g. a UIObserver sampling loop), the idle timer is not armed —
   * subscribers are actively consuming the stream. On a static screen
   * with i-frame-interval=0, no new keyframes arrive so processFrame
   * never resets the timer; this guard prevents silent disconnect.
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (!this.options.idleTimeoutMs) return;

    // Active keyframe subscribers (UIObserver etc.) keep the connection alive
    // even on a static screen where no new keyframes are produced.
    if (this.keyframeListeners.size > 0) return;

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
    this.lastRawKeyframeAt = 0;
    this.isInitialized = false;
    this.keyframeResolvers = [];
    this.keyframeListeners.clear();

    // Cancel reader first to stop consumeFramesLoop
    if (reader) {
      try {
        await reader.cancel();
      } catch (error) {
        debugScrcpy(`Error cancelling scrcpy stream reader: ${error}`);
      }
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
