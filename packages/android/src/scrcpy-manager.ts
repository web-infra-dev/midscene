import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDebug } from '@midscene/shared/logger';
import type { Adb } from '@yume-chan/adb';
import { h264SearchConfiguration } from '@yume-chan/scrcpy';

const debugScrcpy = getDebug('android:scrcpy');

export interface ScrcpyScreenshotOptions {
  maxSize?: number;
  videoBitRate?: number;
  idleTimeoutMs?: number;
}

/**
 * Detect if H.264 frame contains keyframe (IDR) or SPS/PPS
 * H.264 NAL unit types:
 * - 1: non-IDR slice (P/B frame)
 * - 5: IDR slice (keyframe/I-frame)
 * - 7: SPS (Sequence Parameter Set)
 * - 8: PPS (Picture Parameter Set)
 */
function detectH264KeyFrame(buffer: Buffer): boolean {
  // H.264 uses start codes: 0x00 0x00 0x00 0x01 or 0x00 0x00 0x01
  for (let i = 0; i < Math.min(buffer.length - 4, 1000); i++) {
    // Look for 4-byte start code: 0x00 0x00 0x00 0x01
    if (
      buffer[i] === 0x00 &&
      buffer[i + 1] === 0x00 &&
      buffer[i + 2] === 0x00 &&
      buffer[i + 3] === 0x01
    ) {
      const nalUnitType = buffer[i + 4] & 0x1f; // Lower 5 bits
      // Type 5 = IDR (keyframe), Type 7 = SPS, Type 8 = PPS
      if (nalUnitType === 5 || nalUnitType === 7 || nalUnitType === 8) {
        return true;
      }
    }
    // Look for 3-byte start code: 0x00 0x00 0x01
    else if (
      buffer[i] === 0x00 &&
      buffer[i + 1] === 0x00 &&
      buffer[i + 2] === 0x01
    ) {
      const nalUnitType = buffer[i + 3] & 0x1f;
      if (nalUnitType === 5 || nalUnitType === 7 || nalUnitType === 8) {
        return true;
      }
    }
  }
  return false;
}

export class ScrcpyScreenshotManager {
  private adb: Adb;
  private scrcpyClient: any = null;
  private videoStream: any = null;
  private lastFrameBuffer: Buffer | null = null;
  private lastFrameTimestamp = 0;
  private spsHeader: Buffer | null = null; // SPS/PPS header from first keyframe
  private latestFrameBuffer: Buffer | null = null;
  private latestFrameTimestamp = 0;
  private idleTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isInitialized = false;
  private options: ScrcpyScreenshotOptions;
  private ffmpegAvailable: boolean | null = null;
  private recentFrames: Buffer[] = []; // Keep recent frames for GOP

  constructor(adb: Adb, options: ScrcpyScreenshotOptions = {}) {
    this.adb = adb;
    this.options = {
      maxSize: options.maxSize ?? 1024,
      videoBitRate: options.videoBitRate ?? 2_000_000,
      idleTimeoutMs: options.idleTimeoutMs ?? 30000,
    };
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
      debugScrcpy('Connection in progress, waiting...');
      // Wait for connection to complete (simple implementation)
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return this.ensureConnected();
    }

    try {
      this.isConnecting = true;
      debugScrcpy('Starting scrcpy connection...');

      // Import dependencies dynamically
      const { AdbScrcpyClient, AdbScrcpyOptions2_1 } = await import(
        '@yume-chan/adb-scrcpy'
      );
      const { ReadableStream } = await import('@yume-chan/stream-extra');
      const { ScrcpyOptions3_1, DefaultServerPath } = await import(
        '@yume-chan/scrcpy'
      );

      // Push server binary
      const currentDir =
        typeof __dirname !== 'undefined'
          ? __dirname
          : path.dirname(fileURLToPath(import.meta.url));
      // Go up two levels from dist/lib or dist/es to reach package root
      const serverBinPath = path.resolve(currentDir, '../../bin/server.bin');

      await AdbScrcpyClient.pushServer(
        this.adb,
        ReadableStream.from(createReadStream(serverBinPath)),
      );

      // Start scrcpy with optimized options
      const scrcpyOptions = new ScrcpyOptions3_1({
        audio: false,
        control: false, // Screenshot mode doesn't need control
        maxSize: this.options.maxSize,
        videoBitRate: this.options.videoBitRate,
        sendFrameMeta: false, // Reduce overhead
      });

      this.scrcpyClient = await AdbScrcpyClient.start(
        this.adb,
        DefaultServerPath,
        new AdbScrcpyOptions2_1(scrcpyOptions),
      );

      // Get video stream
      this.videoStream = await this.scrcpyClient.videoStream;
      debugScrcpy(
        `Video stream started: ${this.videoStream.metadata.width}x${this.videoStream.metadata.height}`,
      );

      // Start consuming frames
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
   * Consume video frames and keep latest frame
   */
  private async startFrameConsumer(): Promise<void> {
    if (!this.videoStream) return;

    const reader = this.videoStream.stream.getReader();

    const consumeFrames = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Handle data packets (frames)
          const frameBuffer = Buffer.from(value.data);
          const reportedKeyFrame = (value as any).keyframe || false;

          // Manual keyframe detection (more reliable)
          const actualKeyFrame = detectH264KeyFrame(frameBuffer);

          // Store all frames for general use
          this.lastFrameBuffer = frameBuffer;
          this.lastFrameTimestamp = Date.now();

          // Extract SPS/PPS from keyframe using @yume-chan/scrcpy's parser
          if (actualKeyFrame && !this.spsHeader) {
            try {
              const config = h264SearchConfiguration(
                new Uint8Array(frameBuffer),
              );
              if (config.sequenceParameterSet && config.pictureParameterSet) {
                // H.264 Annex B format requires start codes (0x00 0x00 0x00 0x01)
                const startCode = Buffer.from([0x00, 0x00, 0x00, 0x01]);

                // Build complete configuration buffer with start codes: [SC][SPS][SC][PPS]
                this.spsHeader = Buffer.concat([
                  startCode,
                  Buffer.from(config.sequenceParameterSet),
                  startCode,
                  Buffer.from(config.pictureParameterSet),
                ]);
                debugScrcpy(
                  `Extracted SPS/PPS configuration: SPS=${config.sequenceParameterSet.length}B, PPS=${config.pictureParameterSet.length}B, total=${this.spsHeader.length}B (with start codes)`,
                );
              }
            } catch (error) {
              debugScrcpy(`Failed to extract SPS/PPS from keyframe: ${error}`);
            }
          }

          // Update latest frame buffer: prepend SPS/PPS to keyframe for ffmpeg
          if (actualKeyFrame && this.spsHeader) {
            // Combine: [SPS with SC][PPS with SC][Keyframe]
            this.latestFrameBuffer = Buffer.concat([
              this.spsHeader,
              frameBuffer,
            ]);
            this.latestFrameTimestamp = Date.now();
            debugScrcpy(
              `Updated frame buffer: config=${this.spsHeader.length}B + keyframe=${frameBuffer.length}B = ${this.latestFrameBuffer.length}B`,
            );
          }

          // Keep recent frames for potential future use
          this.recentFrames.push(frameBuffer);
          if (this.recentFrames.length > 10) {
            this.recentFrames.shift();
          }

          // Log keyframes and every 20th frame to reduce spam
          if (actualKeyFrame || this.recentFrames.length % 20 === 0) {
            debugScrcpy(
              `Frame: ${frameBuffer.length} bytes, keyFrame=${actualKeyFrame} (reported=${reportedKeyFrame}), hasConfig=${!!this.spsHeader}, recentFrames=${this.recentFrames.length}`,
            );
          }
        }
      } catch (error) {
        debugScrcpy(`Frame consumer error: ${error}`);
        await this.disconnect();
      }
    };

    // Consume frames asynchronously
    consumeFrames().catch((error) => {
      debugScrcpy(`Frame consumer crashed: ${error}`);
    });
  }

  /**
   * Get current screenshot from video stream
   * Note: This returns raw H.264 encoded data
   */
  async getScreenshot(): Promise<Buffer> {
    await this.ensureConnected();

    if (!this.lastFrameBuffer) {
      throw new Error('No frame available yet, please retry');
    }

    // Check if frame is too old (more than 1 second)
    const frameAge = Date.now() - this.lastFrameTimestamp;
    if (frameAge > 1000) {
      debugScrcpy(`Warning: Frame is ${frameAge}ms old`);
    }

    this.resetIdleTimer();

    return this.lastFrameBuffer;
  }

  /**
   * Get screenshot as PNG
   * Decodes H.264 video stream to PNG using ffmpeg
   */
  async getScreenshotPng(): Promise<Buffer> {
    await this.ensureConnected();

    // Check ffmpeg availability
    if (this.ffmpegAvailable === null) {
      this.ffmpegAvailable = await this.checkFfmpegAvailable();
    }

    if (!this.ffmpegAvailable) {
      throw new Error(
        'ffmpeg is not available. Please install ffmpeg to use scrcpy screenshot mode.',
      );
    }

    // Wait for SPS/PPS header (first keyframe) - up to 5 seconds
    const maxWaitTime = 5000;
    const startTime = Date.now();
    while (!this.spsHeader && Date.now() - startTime < maxWaitTime) {
      debugScrcpy(
        `Waiting for first keyframe (SPS/PPS header)... ${Date.now() - startTime}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (!this.spsHeader) {
      throw new Error(
        'No keyframe received yet. Device may have long GOP interval. Please retry.',
      );
    }

    if (!this.latestFrameBuffer) {
      throw new Error('No frames available for decoding');
    }

    // Check if frame is too old (more than 2 seconds)
    const frameAge = Date.now() - this.latestFrameTimestamp;
    if (frameAge > 2000) {
      debugScrcpy(`Warning: Frame is ${frameAge}ms old`);
    }

    this.resetIdleTimer();

    // Decode H.264 stream to PNG using ffmpeg
    debugScrcpy(
      `Decoding H.264 stream: ${this.latestFrameBuffer.length} bytes (header: ${this.spsHeader.length}, recent: ${this.recentFrames.length} frames)`,
    );
    return this.decodeH264ToPng(this.latestFrameBuffer);
  }

  /**
   * Check if ffmpeg is available in the system
   */
  private async checkFfmpegAvailable(): Promise<boolean> {
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);

      await execFileAsync('ffmpeg', ['-version']);
      debugScrcpy('ffmpeg is available');
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
      const ffmpeg = spawn(
        'ffmpeg',
        [
          '-f',
          'h264', // Input format
          '-i',
          'pipe:0', // Input from stdin
          '-vframes',
          '1', // Extract 1 frame
          '-f',
          'image2pipe', // Output as image
          '-vcodec',
          'png', // PNG codec
          '-loglevel',
          'error', // Only show errors
          'pipe:1', // Output to stdout
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

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
          reject(new Error(`FFmpeg decode failed: ${errorMsg}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });

      // Write H.264 data to ffmpeg stdin
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

    debugScrcpy('Scrcpy disconnected');
  }

  /**
   * Check if scrcpy is initialized and connected
   */
  isConnected(): boolean {
    return this.isInitialized && this.scrcpyClient !== null;
  }
}
