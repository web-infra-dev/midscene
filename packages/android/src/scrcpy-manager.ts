import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { getDebug } from '@midscene/shared/logger';
import type { Adb } from '@yume-chan/adb';
import { resolveExternalResourcePath } from './resource-path';

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
// Maximum time to wait for a frame that crosses the active freshness target
// before closing the stale epoch and letting the caller use ADB fallback.
const FRESH_FRAME_TIMEOUT_MS = 300;
const KEYFRAME_POLL_INTERVAL_MS = 200;
const MAX_SCAN_BYTES = 1_000;
const CONNECTION_WAIT_MS = 1_000;
const MAX_SERVER_OUTPUT_LINES = 100;
const SERVER_OUTPUT_DRAIN_TIMEOUT_MS = 500;
const MAX_FRAME_AGE_US = 500_000n;
const FRAME_FRESHNESS_WARN_INTERVAL_MS = 5_000;
const TRANSPORT_BACKLOG_WARN_INTERVAL_MS = 5_000;
const DEVICE_UPTIME_COMMAND = ['dumpsys', 'power'] as const;

export const SCRCPY_VIDEO_BIT_RATE_NETWORK_HINT =
  'The appropriate scrcpy video bitrate depends on network conditions. For constrained remote links, pass --scrcpy-video-bit-rate 4000000 in the Android CLI, or set scrcpyConfig.videoBitRate to 4_000_000 (4 Mbps) in SDK/YAML configuration. Lower it further if backlog persists.';

const CONSTRAINED_LINK_STARTING_VIDEO_BIT_RATE = 4_000_000;

export function getScrcpyVideoBitRateNetworkHint(
  currentVideoBitRate: number,
): string {
  if (currentVideoBitRate <= CONSTRAINED_LINK_STARTING_VIDEO_BIT_RATE) {
    return 'The current scrcpy video bitrate is already at or below 4 Mbps. Lowering it further is unlikely to help on a local USB connection; check whether the screen was static or the device encoder emitted no new frame.';
  }
  return SCRCPY_VIDEO_BIT_RATE_NETWORK_HINT;
}

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
 * Holding these is cheap — decoding to JPEG costs an ffmpeg run per frame, so
 * consumers (e.g. UI observers) buffer raw keyframes and decode only
 * the frames they actually need, after sampling.
 */
export interface RawKeyframe {
  /** Raw H.264 keyframe data WITHOUT the SPS/PPS header. */
  data: Buffer;
  /** SPS/PPS header active when this frame was produced (needed to decode). */
  header: Buffer;
  /** Device-monotonic capture timestamp forwarded by scrcpy. */
  ptsUs?: bigint;
  /** Estimated frame age when the packet reached the host. */
  estimatedAgeMs?: number;
  capturedAt: number;
}

export const SCRCPY_FRESH_FRAME_UNAVAILABLE_ERROR_CODE =
  'ERR_SCRCPY_FRESH_FRAME_UNAVAILABLE';

export class ScrcpyFreshFrameUnavailableError extends Error {
  readonly code = SCRCPY_FRESH_FRAME_UNAVAILABLE_ERROR_CODE;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ScrcpyFreshFrameUnavailableError';
  }
}

export function isScrcpyFreshFrameUnavailableError(
  error: unknown,
): error is ScrcpyFreshFrameUnavailableError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === SCRCPY_FRESH_FRAME_UNAVAILABLE_ERROR_CODE
  );
}

interface DeviceClockCalibration {
  deviceUptimeUs: bigint;
  hostMonotonicUs: bigint;
  hostWallTimeMs: number;
  roundTripUs: bigint;
}

interface FrameAgeEstimate {
  estimatedAgeUs: bigint;
  calibrationUncertaintyUs: bigint;
  upperBoundUs: bigint;
}

export interface ScrcpyFreshnessBarrierOptions {
  hostMonotonicUs?: bigint;
  allowOverAgeForNextCapture?: boolean;
}

/**
 * Reconstruct SystemClock.uptimeMillis() from TimeUtils.formatUptime(), which
 * PowerManagerService uses for the `mLastWakeTime` line.
 */
export function parseDeviceUptimeMs(output: string): bigint {
  const match = output.match(
    /mLastWakeTime=(\d+)\s+\((?:(\d+) ms ago|in (\d+) ms|now)\)/,
  );
  if (!match) {
    throw new Error(
      `Unable to read Android device uptime from dumpsys power: ${output.trim() || '<empty output>'}`,
    );
  }

  const referenceMs = BigInt(match[1]);
  if (match[2]) return referenceMs + BigInt(match[2]);
  if (match[3]) return referenceMs - BigInt(match[3]);
  return referenceMs;
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
  private keyframeResolvers: Array<(frame: RawKeyframe) => void> = [];
  private keyframeListeners = new Set<(frame: RawKeyframe) => void>();
  private lastRawKeyframe: Buffer | null = null;
  private lastRawKeyframeAt = 0;
  private lastRawKeyframePtsUs: bigint | undefined;
  private lastRawKeyframeEstimatedAgeMs: number | undefined;
  private videoResolution: { width: number; height: number } | null = null;
  private streamReader: any = null;
  private frameFreshnessBarrierPtsUs: bigint | null = null;
  private frameFreshnessBarrierReason: string | null = null;
  private frameFreshnessBarrierAllowsOverAgeForNextCapture = false;
  private frameFreshnessBarrierPending = false;
  private frameFreshnessBarrierGeneration = 0;
  private deviceClockCalibration: DeviceClockCalibration | null = null;
  private deviceClockCalibrationPromise: Promise<DeviceClockCalibration> | null =
    null;
  private lastFramePtsUs: bigint | null = null;
  private frameFreshnessError: Error | null = null;
  private lastFrameFreshnessWarningAt = 0;
  // Keep this across stream epoch rebuilds so repeated recovery attempts do
  // not emit the same network-tuning hint for every screenshot.
  private lastTransportBacklogWarningAt = 0;

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
      await this.ensureFrameClockCalibration();
      this.resetIdleTimer();
      return;
    }

    if (this.isConnecting) {
      debugScrcpy('Connection already in progress, waiting...');
      await new Promise((resolve) => setTimeout(resolve, CONNECTION_WAIT_MS));
      // After waiting, check if the other connection attempt succeeded
      if (this.scrcpyClient && this.videoStream) {
        await this.ensureFrameClockCalibration();
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

      const { AdbScrcpyClient } = await import('@yume-chan/adb-scrcpy');
      const { ReadableStream } = await import('@yume-chan/stream-extra');
      const { DefaultServerPath } = await import('@yume-chan/scrcpy');

      // Use local scrcpy-server file
      const serverBinPath = this.resolveServerBinPath();
      await AdbScrcpyClient.pushServer(
        this.adb,
        ReadableStream.from(createReadStream(serverBinPath)),
      );

      const scrcpyOptions = await this.createScrcpyOptions();

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

      // Establish exactly one device/host monotonic clock anchor for this
      // stream epoch. Frame age and all later barriers are projected from this
      // anchor without another ADB clock read.
      await this.ensureFrameClockCalibration();
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

  private async createScrcpyOptions(): Promise<any> {
    const [{ AdbScrcpyOptions3_3_3 }, { ScrcpyInstanceId }] = await Promise.all(
      [import('@yume-chan/adb-scrcpy'), import('@yume-chan/scrcpy')],
    );

    return new AdbScrcpyOptions3_3_3({
      audio: false,
      control: false,
      tunnelForward: true,
      scid: ScrcpyInstanceId.random(),
      maxSize: this.options.maxSize,
      videoBitRate: this.options.videoBitRate,
      maxFps: 10,
      sendFrameMeta: true,
      // scrcpy otherwise asks MediaCodec to repeat the previous frame every
      // 100ms. Such a packet has a newer PTS but unchanged pixels, so neither
      // a PTS barrier nor an age check could detect that the image is stale.
      videoCodecOptions:
        'i-frame-interval=0,bitrate-mode=2,repeat-previous-frame-after=0',
    });
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
    return resolveExternalResourcePath(
      path.join(path.dirname(androidPkgJson), 'bin', 'scrcpy-server'),
    );
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

    const receivedAtUs = this.monotonicTimeUs();
    if (!this.isFrameFresh(packet.pts)) {
      return;
    }

    // Data packet - each packet is a complete frame
    const frameBuffer = Buffer.from(packet.data);
    const isKeyFrame = detectH264KeyFrame(frameBuffer);

    if (isKeyFrame && this.spsHeader) {
      const timing = this.estimateFrameTiming(packet.pts, receivedAtUs);
      this.lastRawKeyframe = frameBuffer;
      this.lastRawKeyframeAt = timing.capturedAt;
      this.lastRawKeyframePtsUs = packet.pts;
      this.lastRawKeyframeEstimatedAgeMs = timing.estimatedAgeMs;
      const frame: RawKeyframe = {
        data: frameBuffer,
        header: this.spsHeader,
        ptsUs: packet.pts,
        estimatedAgeMs: timing.estimatedAgeMs,
        capturedAt: this.lastRawKeyframeAt,
      };
      if (this.keyframeResolvers.length > 0) {
        this.notifyKeyframeWaiters(frame);
      }
      if (
        this.keyframeListeners.size > 0 &&
        this.isFrameAgeAcceptable(packet.pts, receivedAtUs)
      ) {
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
   * Read the Android uptime clock used by Surface/MediaCodec frame PTS values.
   * The host timestamps bracket the ADB request so frame age can also be
   * estimated on the host wall clock for reports.
   */
  private async readDeviceClockCalibration(): Promise<DeviceClockCalibration> {
    const startedAtUs = this.monotonicTimeUs();
    const startedAtWallMs = Date.now();
    const shellProtocol = this.adb.subprocess.shellProtocol;
    let output: string;

    if (shellProtocol) {
      const result = await shellProtocol.spawnWaitText(DEVICE_UPTIME_COMMAND);
      if (result.exitCode !== 0) {
        throw new Error(
          `Unable to read Android device uptime (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`,
        );
      }
      output = result.stdout;
    } else {
      output = await this.adb.subprocess.noneProtocol.spawnWaitText(
        DEVICE_UPTIME_COMMAND,
      );
    }

    const finishedAtUs = this.monotonicTimeUs();
    const finishedAtWallMs = Date.now();
    return {
      deviceUptimeUs: parseDeviceUptimeMs(output) * 1_000n,
      hostMonotonicUs: startedAtUs + (finishedAtUs - startedAtUs) / 2n,
      hostWallTimeMs:
        startedAtWallMs + (finishedAtWallMs - startedAtWallMs) / 2,
      roundTripUs: finishedAtUs - startedAtUs,
    };
  }

  async ensureFrameClockCalibration(): Promise<void> {
    if (this.deviceClockCalibration) return;
    if (this.deviceClockCalibrationPromise) {
      await this.deviceClockCalibrationPromise;
      if (!this.deviceClockCalibration) {
        throw new Error(
          'Scrcpy stream epoch changed while calibrating the frame clock',
        );
      }
      return;
    }

    const calibrationPromise = this.readDeviceClockCalibration();
    this.deviceClockCalibrationPromise = calibrationPromise;
    try {
      const calibration = await calibrationPromise;
      // disconnect() clears the promise to invalidate an in-flight sample from
      // an obsolete stream epoch.
      if (this.deviceClockCalibrationPromise !== calibrationPromise) {
        throw new Error(
          'Scrcpy stream epoch changed while calibrating the frame clock',
        );
      }
      this.deviceClockCalibration = calibration;
      this.frameFreshnessBarrierPending = false;
      this.lastFramePtsUs = null;
      this.frameFreshnessError = null;
      debugScrcpy(
        `Calibrated scrcpy frame clock for stream epoch (RTT=${Number(calibration.roundTripUs / 1_000n)}ms)`,
      );
    } finally {
      if (this.deviceClockCalibrationPromise === calibrationPromise) {
        this.deviceClockCalibrationPromise = null;
      }
    }
  }

  /**
   * Invalidate cached frames and require future packets to be captured after
   * the host-monotonic action/planning boundary projected onto the device
   * clock. A caller recovering an unavailable stream can pass the original
   * action-boundary timestamp so connection startup latency does not move the
   * barrier forward. Action barriers may allow the first proven post-boundary
   * frame to survive a long wait-after-action delay. The projection reuses the
   * single calibration for this stream epoch and does not issue another ADB
   * clock read.
   */
  async setFreshnessBarrier(
    reason: string,
    options: ScrcpyFreshnessBarrierOptions = {},
  ): Promise<bigint> {
    const generation = ++this.frameFreshnessBarrierGeneration;
    this.frameFreshnessBarrierPending = true;
    this.frameFreshnessBarrierAllowsOverAgeForNextCapture = false;
    this.clearFrameCache();

    try {
      const calibration = this.deviceClockCalibration;
      if (!calibration) {
        throw new Error(
          'Scrcpy frame clock is not calibrated for the current stream epoch',
        );
      }

      const hostMonotonicUs = options.hostMonotonicUs ?? this.monotonicTimeUs();
      const estimatedDeviceNowUs = this.estimateDeviceTimeUs(
        hostMonotonicUs,
        calibration,
      );
      // The ADB response can have been sampled anywhere within the measured
      // round trip. Add half the RTT before advancing to the next millisecond
      // so an anchor that is slightly early cannot admit a pre-action frame.
      const conservativeDeviceNowUs =
        estimatedDeviceNowUs + this.getCalibrationUncertaintyUs(calibration);
      const barrierPtsUs = (conservativeDeviceNowUs / 1_000n + 1n) * 1_000n;

      if (generation !== this.frameFreshnessBarrierGeneration) {
        return this.frameFreshnessBarrierPtsUs ?? barrierPtsUs;
      }

      this.frameFreshnessBarrierPtsUs =
        this.frameFreshnessBarrierPtsUs === null ||
        barrierPtsUs > this.frameFreshnessBarrierPtsUs
          ? barrierPtsUs
          : this.frameFreshnessBarrierPtsUs;
      this.frameFreshnessBarrierReason = reason;
      this.frameFreshnessBarrierAllowsOverAgeForNextCapture =
        options.allowOverAgeForNextCapture ?? false;
      this.frameFreshnessBarrierPending = false;
      this.frameFreshnessError = null;
      this.lastFramePtsUs = null;
      this.clearFrameCache();

      debugScrcpy(
        `Armed frame freshness barrier at PTS ${this.frameFreshnessBarrierPtsUs}µs (${reason}, projected from stream-epoch clock anchor, uncertainty<=${Number(this.getCalibrationUncertaintyUs(calibration)) / 1_000}ms)`,
      );
      return this.frameFreshnessBarrierPtsUs;
    } catch (error) {
      if (generation === this.frameFreshnessBarrierGeneration) {
        this.frameFreshnessBarrierPending = false;
        this.frameFreshnessError = new Error(
          `Unable to establish scrcpy frame freshness barrier (${reason}): ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      throw this.frameFreshnessError ?? error;
    }
  }

  private isFrameFresh(packetPtsUs: bigint | undefined): boolean {
    if (this.frameFreshnessBarrierPending) {
      return false;
    }

    if (packetPtsUs !== undefined) {
      if (this.lastFramePtsUs !== null && packetPtsUs < this.lastFramePtsUs) {
        this.frameFreshnessError = new Error(
          'Scrcpy frame PTS moved backwards; refusing frames until the device clock anchor is recalibrated',
        );
        this.frameFreshnessBarrierPending = true;
        this.frameFreshnessBarrierPtsUs = null;
        this.frameFreshnessBarrierReason = null;
        this.frameFreshnessBarrierAllowsOverAgeForNextCapture = false;
        this.deviceClockCalibration = null;
        this.clearFrameCache();
        this.warnFrameFreshness();
        return false;
      }
      this.lastFramePtsUs = packetPtsUs;
    }

    if (this.frameFreshnessBarrierPtsUs === null) {
      return true;
    }

    if (packetPtsUs === undefined) {
      this.frameFreshnessError = new Error(
        'Scrcpy frame has no PTS metadata; cannot prove that it is newer than the freshness barrier',
      );
      this.warnFrameFreshness();
      return false;
    }

    if (packetPtsUs >= this.frameFreshnessBarrierPtsUs) {
      if (this.frameFreshnessError) {
        debugScrcpy(
          `Scrcpy video crossed the ${this.frameFreshnessBarrierReason ?? 'active'} freshness barrier at PTS ${packetPtsUs}µs`,
        );
      }
      this.frameFreshnessError = null;
      return true;
    }

    const behindBarrierUs = this.frameFreshnessBarrierPtsUs - packetPtsUs;
    this.frameFreshnessError = new Error(
      `Scrcpy frame predates the ${this.frameFreshnessBarrierReason ?? 'active'} freshness barrier by ${Number(behindBarrierUs) / 1_000}ms; refusing to use it`,
    );
    this.clearFrameCache();
    debugScrcpy(this.frameFreshnessError.message);
    return false;
  }

  private estimateFrameAgeUs(
    packetPtsUs: bigint | undefined,
    hostMonotonicUs = this.monotonicTimeUs(),
  ): bigint | null {
    return (
      this.estimateFrameAge(packetPtsUs, hostMonotonicUs)?.estimatedAgeUs ??
      null
    );
  }

  private estimateFrameAge(
    packetPtsUs: bigint | undefined,
    hostMonotonicUs = this.monotonicTimeUs(),
  ): FrameAgeEstimate | null {
    const calibration = this.deviceClockCalibration;
    if (packetPtsUs === undefined || !calibration) {
      return null;
    }

    const estimatedDeviceNowUs = this.estimateDeviceTimeUs(
      hostMonotonicUs,
      calibration,
    );
    const estimatedAgeUs =
      estimatedDeviceNowUs > packetPtsUs
        ? estimatedDeviceNowUs - packetPtsUs
        : 0n;
    const calibrationUncertaintyUs =
      this.getCalibrationUncertaintyUs(calibration);
    return {
      estimatedAgeUs,
      calibrationUncertaintyUs,
      upperBoundUs: estimatedAgeUs + calibrationUncertaintyUs,
    };
  }

  private estimateDeviceTimeUs(
    hostMonotonicUs: bigint,
    calibration: DeviceClockCalibration,
  ): bigint {
    return (
      calibration.deviceUptimeUs +
      (hostMonotonicUs - calibration.hostMonotonicUs)
    );
  }

  private getCalibrationUncertaintyUs(
    calibration: DeviceClockCalibration,
  ): bigint {
    // The device may have generated the dumpsys value anywhere within the ADB
    // round trip. Anchoring it at the host midpoint therefore leaves at most
    // half an RTT of uncertainty. Round up so the upper bound stays safe.
    return (calibration.roundTripUs + 1n) / 2n;
  }

  private isFrameAgeAcceptable(
    packetPtsUs: bigint | undefined,
    hostMonotonicUs = this.monotonicTimeUs(),
  ): boolean {
    const age = this.estimateFrameAge(packetPtsUs, hostMonotonicUs);
    if (age === null) {
      this.frameFreshnessError = new Error(
        packetPtsUs === undefined
          ? 'Scrcpy frame has no PTS metadata; cannot prove its absolute age'
          : 'Scrcpy frame clock is not calibrated; cannot prove its absolute age',
      );
      this.warnFrameFreshness();
      return false;
    }

    if (age.upperBoundUs <= MAX_FRAME_AGE_US) {
      if (this.frameFreshnessError) {
        debugScrcpy(
          `Scrcpy frame age recovered (upper bound=${Number(age.upperBoundUs) / 1_000}ms, estimated=${Number(age.estimatedAgeUs) / 1_000}ms, clock uncertainty<=${Number(age.calibrationUncertaintyUs) / 1_000}ms)`,
        );
        this.frameFreshnessError = null;
      }
      return true;
    }

    this.frameFreshnessError = new Error(
      `Scrcpy frame absolute age upper bound is ${Number(age.upperBoundUs) / 1_000}ms (estimated=${Number(age.estimatedAgeUs) / 1_000}ms, clock uncertainty<=${Number(age.calibrationUncertaintyUs) / 1_000}ms), exceeding the ${Number(MAX_FRAME_AGE_US / 1_000n)}ms limit`,
    );
    this.warnFrameFreshness();
    return false;
  }

  private warnFrameFreshness(): void {
    if (!this.frameFreshnessError) return;
    const now = Date.now();
    if (
      now - this.lastFrameFreshnessWarningAt >=
      FRAME_FRESHNESS_WARN_INTERVAL_MS
    ) {
      warnScrcpy(this.frameFreshnessError.message);
      this.lastFrameFreshnessWarningAt = now;
    }
  }

  private warnTransportBacklog(error: unknown): void {
    const now = Date.now();
    if (
      now - this.lastTransportBacklogWarningAt <
      TRANSPORT_BACKLOG_WARN_INTERVAL_MS
    ) {
      return;
    }

    const cause = this.frameFreshnessError ?? error;
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    const currentBitRateMbps = this.options.videoBitRate / 1_000_000;
    const networkHint = getScrcpyVideoBitRateNetworkHint(
      this.options.videoBitRate,
    );
    warnScrcpy(
      `No usable scrcpy frame crossed the active freshness target within ${FRESH_FRAME_TIMEOUT_MS}ms; closing the stale stream epoch and falling back to ADB screenshot. This may indicate transport backlog or a static screen that emitted no new frame. ${networkHint} Current videoBitRate: ${this.options.videoBitRate} bps (${currentBitRateMbps} Mbps).\nError: ${causeMessage}`,
    );
    this.lastTransportBacklogWarningAt = now;
  }

  private estimateFrameTiming(
    packetPtsUs: bigint | undefined,
    receivedAtUs: bigint,
  ): { capturedAt: number; estimatedAgeMs?: number } {
    const calibration = this.deviceClockCalibration;
    if (packetPtsUs === undefined || !calibration) {
      return { capturedAt: Date.now() };
    }

    const estimatedAgeUs =
      this.estimateFrameAgeUs(packetPtsUs, receivedAtUs) ?? 0n;
    const estimatedAgeMs = Number(estimatedAgeUs) / 1_000;
    const receivedAtWallTimeMs =
      calibration.hostWallTimeMs +
      Number(receivedAtUs - calibration.hostMonotonicUs) / 1_000;
    return {
      // Derive capture time from the same age estimate and clamp impossible
      // future PTS values to the packet's estimated host receipt time.
      capturedAt: receivedAtWallTimeMs - estimatedAgeMs,
      estimatedAgeMs,
    };
  }

  private clearFrameCache(): void {
    this.lastRawKeyframe = null;
    this.lastRawKeyframeAt = 0;
    this.lastRawKeyframePtsUs = undefined;
    this.lastRawKeyframeEstimatedAgeMs = undefined;
  }

  private monotonicTimeUs(): bigint {
    return process.hrtime.bigint() / 1_000n;
  }

  private resetFrameFreshnessState(): void {
    this.frameFreshnessBarrierPtsUs = null;
    this.frameFreshnessBarrierReason = null;
    this.frameFreshnessBarrierAllowsOverAgeForNextCapture = false;
    this.frameFreshnessBarrierPending = false;
    this.frameFreshnessBarrierGeneration = 0;
    this.deviceClockCalibration = null;
    this.deviceClockCalibrationPromise = null;
    this.lastFramePtsUs = null;
    this.frameFreshnessError = null;
    this.lastFrameFreshnessWarningAt = 0;
  }

  /**
   * Subscribe to raw keyframes as they arrive from the stream. While at least
   * one subscriber is active, incoming keyframes keep resetting the idle timer
   * so the connection is not torn down mid-capture. Returns an unsubscribe fn.
   *
   * Frames are emitted RAW (no decoding). Use {@link decodeRawKeyframeToJpeg}
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
    const frame = this.getCachedKeyframeCandidate();
    if (!frame || !this.isFrameAgeAcceptable(frame.ptsUs)) return null;
    return frame;
  }

  private getCachedKeyframeCandidate(): RawKeyframe | null {
    if (!this.lastRawKeyframe || !this.spsHeader) return null;
    return {
      data: this.lastRawKeyframe,
      header: this.spsHeader,
      ptsUs: this.lastRawKeyframePtsUs,
      estimatedAgeMs: this.lastRawKeyframeEstimatedAgeMs,
      capturedAt: this.lastRawKeyframeAt,
    };
  }

  private canReuseFrameAcrossActionWait(frame: RawKeyframe): boolean {
    return (
      this.frameFreshnessBarrierAllowsOverAgeForNextCapture &&
      this.frameFreshnessBarrierPtsUs !== null &&
      frame.ptsUs !== undefined &&
      frame.ptsUs >= this.frameFreshnessBarrierPtsUs
    );
  }

  private consumeActionFreshnessBarrier(frame: RawKeyframe): void {
    if (!this.canReuseFrameAcrossActionWait(frame)) return;
    this.frameFreshnessBarrierPtsUs = null;
    this.frameFreshnessBarrierReason = null;
    this.frameFreshnessBarrierAllowsOverAgeForNextCapture = false;
    this.frameFreshnessError = null;
  }

  /**
   * Decode a raw keyframe (from {@link subscribeKeyframes} or
   * {@link getLatestRawKeyframe}) to a JPEG buffer. This is the deferred,
   * per-frame-expensive step (one ffmpeg process per call) — call it only on
   * sampled frames, never inside a capture loop.
   */
  async decodeRawKeyframeToJpeg(frame: RawKeyframe): Promise<Buffer> {
    return this.decodeH264ToJpeg(Buffer.concat([frame.header, frame.data]));
  }

  private async waitForUsableKeyframe(timeoutMs: number): Promise<RawKeyframe> {
    const deadline = Date.now() + timeoutMs;
    let candidate = this.getCachedKeyframeCandidate();

    while (true) {
      if (candidate && this.isFrameAgeAcceptable(candidate.ptsUs)) {
        return candidate;
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new Error(`No fresh keyframe received within ${timeoutMs}ms`);
      }

      candidate = await this.waitForNextKeyframe(remainingMs);
    }
  }

  /**
   * Ensure a newly connected stream has a calibrated, temporally fresh frame
   * before it is exposed again after ADB fallback.
   */
  async prepareFreshFrame(): Promise<void> {
    await this.ensureConnected();
    await this.ensureFrameClockCalibration();
    await this.waitForKeyframe();
    await this.waitForUsableKeyframe(MAX_KEYFRAME_WAIT_MS);
  }

  private async waitForPlanningFrame(): Promise<RawKeyframe> {
    let planningBarrierArmed = false;
    let deadline = Date.now() + FRESH_FRAME_TIMEOUT_MS;
    let candidate = this.getCachedKeyframeCandidate();

    while (true) {
      if (candidate) {
        if (candidate.ptsUs === undefined) {
          throw new Error(
            'Scrcpy frame has no PTS metadata; cannot prove planning freshness',
          );
        }

        if (this.canReuseFrameAcrossActionWait(candidate)) {
          debugScrcpy(
            `Using frame PTS ${candidate.ptsUs}µs that crossed the active input-action barrier; preserving the settled frame across wait-after-action`,
          );
          return candidate;
        }

        const age = this.estimateFrameAge(candidate.ptsUs);
        if (age === null) {
          throw new Error(
            'Scrcpy frame clock is not calibrated; cannot prove planning freshness',
          );
        }

        if (age.upperBoundUs <= MAX_FRAME_AGE_US) {
          return candidate;
        }

        if (!planningBarrierArmed) {
          debugScrcpy(
            `Planning candidate PTS ${candidate.ptsUs}µs has absolute age upper bound ${Number(age.upperBoundUs) / 1_000}ms (estimated=${Number(age.estimatedAgeUs) / 1_000}ms, clock uncertainty<=${Number(age.calibrationUncertaintyUs) / 1_000}ms), exceeding the ${Number(MAX_FRAME_AGE_US / 1_000n)}ms limit; arming a planning freshness barrier`,
          );
          await this.setFreshnessBarrier('stale planning frame');
          planningBarrierArmed = true;
          deadline = Date.now() + FRESH_FRAME_TIMEOUT_MS;
        } else {
          this.clearFrameCache();
        }
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        throw new Error(
          `No scrcpy frame crossed the active freshness target within ${FRESH_FRAME_TIMEOUT_MS}ms`,
        );
      }

      candidate = await this.waitForNextKeyframe(remainingMs);
    }
  }

  private async closeStaleStreamAndCreateFallbackError(
    error: unknown,
  ): Promise<ScrcpyFreshFrameUnavailableError> {
    this.warnTransportBacklog(error);
    const causeMessage = error instanceof Error ? error.message : String(error);
    await this.disconnect();
    return new ScrcpyFreshFrameUnavailableError(
      `Unable to obtain a fresh scrcpy frame; the stale stream epoch was closed so the caller can use ADB screenshot fallback. ${causeMessage}`,
      { cause: error },
    );
  }

  /**
   * Get screenshot as JPEG.
   * Reuses one frame that crossed the active input-action barrier even if a
   * long wait-after-action made its absolute age exceed the planning limit.
   * Other over-age candidates arm a planning barrier on demand. If no frame
   * crosses the resulting freshness target in time, close this stream epoch
   * and let the caller use ADB.
   */
  async getScreenshotJpeg(): Promise<Buffer> {
    const perfStart = Date.now();

    const t1 = Date.now();
    await this.ensureConnected();
    const connectTime = Date.now() - t1;

    const t2 = Date.now();
    let frame: RawKeyframe;
    try {
      await this.ensureFrameClockCalibration();
      await this.waitForKeyframe();
      frame = await this.waitForPlanningFrame();
    } catch (error) {
      throw await this.closeStaleStreamAndCreateFallbackError(error);
    }
    const frameWaitTime = Date.now() - t2;
    const keyframeBuffer = Buffer.concat([frame.header, frame.data]);

    this.resetIdleTimer();

    debugScrcpy(
      `Decoding H.264 stream: ${keyframeBuffer.length} bytes (post-barrier)`,
    );

    const t5 = Date.now();
    const result = await this.decodeH264ToJpeg(keyframeBuffer);
    const decodeTime = Date.now() - t5;
    this.consumeActionFreshnessBarrier(frame);

    const totalTime = Date.now() - perfStart;
    debugScrcpy(
      `Performance: total=${totalTime}ms (connect=${connectTime}ms, frameWait=${frameWaitTime}ms, decode=${decodeTime}ms)`,
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
  private notifyKeyframeWaiters(frame: RawKeyframe): void {
    const resolvers = this.keyframeResolvers;
    this.keyframeResolvers = [];
    for (const resolve of resolvers) {
      resolve(frame);
    }
  }

  /**
   * Wait for the next keyframe to arrive
   */
  private waitForNextKeyframe(timeoutMs: number): Promise<RawKeyframe> {
    return new Promise<RawKeyframe>((resolve, reject) => {
      const wrappedResolve = (frame: RawKeyframe) => {
        clearTimeout(timer);
        resolve(frame);
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
    this.clearFrameCache();
    this.isInitialized = false;
    this.keyframeResolvers = [];
    this.keyframeListeners.clear();
    this.resetFrameFreshnessState();

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
