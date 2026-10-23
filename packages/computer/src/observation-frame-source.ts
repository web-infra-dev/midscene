import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import type { DeviceFrameRef, DeviceFrameSource } from '@midscene/core/device';
import { observationTimingSchema } from '@midscene/shared/agent-tools/observation-timing';

export interface ObservationFrameProcessOptions {
  /** Explicit trusted executable, e.g. the optional Wayland helper or ssh to a guest running it. No shell is used. */
  command: string;
  args?: string[];
  /** Bounds one wire frame, not the observation buffer. Default 32 MiB. */
  maxFrameBytes?: number;
}

function frameByteLimit(value = 32 * 1024 * 1024): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error('Invalid frame byte limit');
  return value;
}

/** Validate shared options before either factory creates a process it must own. */
function spawnObservationProcess(options: ObservationFrameProcessOptions) {
  frameByteLimit(options.maxFrameBytes);
  return spawn(options.command, options.args ?? [], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** Opt-in native NDJSON transport. Source times survive buffering and PNG decoding. */
class NativeFrameTransport implements DeviceFrameSource {
  private current: DeviceFrameRef | null = null;
  private listeners = new Set<(frame: DeviceFrameRef) => void>();
  private pending = Buffer.alloc(0);
  private failure?: Error;
  private stopped = false;
  private previousTime = Number.NEGATIVE_INFINITY;
  private clockId?: string;
  private ids = new Set<string>();
  private readonly maxFrameBytes: number;

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    maxFrameBytes = 32 * 1024 * 1024,
    private readonly regionGeometry?: RegionGeometry,
  ) {
    this.maxFrameBytes = frameByteLimit(maxFrameBytes);
    child.stdout.on('data', (chunk: Buffer) => this.receive(chunk));
    child.on('error', (error) => this.fail(error));
    child.on('close', (code) => {
      if (!this.stopped)
        this.fail(
          new Error(
            `Native observation source exited (${code}); frame coverage ended`,
          ),
        );
    });
    // Do not expose arbitrary process stderr (which may contain host details) in reports.
    child.stderr.resume();
  }

  private fail(error: unknown): void {
    this.failure ??= error instanceof Error ? error : new Error(String(error));
    this.child.kill();
    // Wrappers may exit while descendants still hold these pipes. Closing the
    // owned endpoints prevents orphan producers from retaining the event loop.
    this.child.stdin.destroy();
    this.child.stdout.destroy();
    this.child.stderr.destroy();
  }

  private receive(chunk: Buffer): void {
    if (this.stopped || this.failure) return;
    this.pending = Buffer.concat([this.pending, chunk]);
    try {
      while (true) {
        const end = this.pending.indexOf(10);
        if (end < 0) break;
        if (end > this.maxFrameBytes)
          throw new Error('Native observation frame exceeds byte limit');
        const wire = JSON.parse(this.pending.subarray(0, end).toString('utf8'));
        this.pending = this.pending.subarray(end + 1);
        if (
          wire.version !== 1 ||
          typeof wire.frameId !== 'string' ||
          !wire.frameId ||
          this.ids.has(wire.frameId)
        )
          throw new Error('Invalid or duplicate native frame identity');
        if (this.regionGeometry) {
          const geometry = wire.geometry;
          if (
            !geometry ||
            geometry.scope !== 'region' ||
            Object.entries(this.regionGeometry).some(
              ([key, value]) => geometry[key] !== value,
            )
          )
            throw new Error('Native region geometry changed or is missing');
          if (
            wire.width !==
              this.regionGeometry.width * this.regionGeometry.scale ||
            wire.height !==
              this.regionGeometry.height * this.regionGeometry.scale
          )
            throw new Error('Region pixel scale mismatch');
          const match = /^(\d+)-(\d+)$/.exec(wire.frameId);
          if (
            !match ||
            Number(match[2]) !== this.ids.size + 1 ||
            (this.ids.size && !this.ids.has(`${match[1]}-1`))
          )
            throw new Error('Native region frame sequence gap');
        } else if (wire.geometry?.scope === 'region') {
          throw new Error(
            'Region frames cannot be used as Agent full-screen screenshots',
          );
        }
        const timing = observationTimingSchema.parse(wire.timing);
        if (this.clockId && timing.clockId !== this.clockId)
          throw new Error('Native frame clock domain changed');
        if (timing.startMs < this.previousTime)
          throw new Error('Native frames arrived out of order');
        if (
          typeof wire.pngBase64 !== 'string' ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(wire.pngBase64)
        )
          throw new Error('Invalid native PNG payload');
        const png = Buffer.from(wire.pngBase64, 'base64');
        if (
          png.length < 24 ||
          !png
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          png.readUInt32BE(16) !== wire.width ||
          png.readUInt32BE(20) !== wire.height
        )
          throw new Error('Native frame dimensions do not match PNG');
        this.ids.add(wire.frameId);
        this.clockId = timing.clockId;
        this.previousTime = timing.startMs;
        this.current = {
          ref: png,
          capturedAt: Date.now(),
          timing,
          frameId: wire.frameId,
        };
        for (const listener of this.listeners) listener(this.current);
      }
      if (this.pending.length > this.maxFrameBytes)
        throw new Error('Native observation frame exceeds byte limit');
    } catch (error) {
      this.fail(error);
    }
  }

  latest(): DeviceFrameRef | null {
    if (this.failure) throw this.failure;
    return this.current;
  }
  subscribe(listener: (frame: DeviceFrameRef) => void): () => void {
    if (this.stopped) throw new Error('Native frame source is stopped');
    if (this.failure) throw this.failure;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  async decode(frames: DeviceFrameRef[]): Promise<string[]> {
    return frames.map((frame) => {
      if (!Buffer.isBuffer(frame.ref))
        throw new Error('Invalid native frame handle');
      return `data:image/png;base64,${frame.ref.toString('base64')}`;
    });
  }
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.listeners.clear();
    this.child.kill();
    // Wrappers may exit while descendants still hold these pipes. Closing the
    // owned endpoints prevents orphan producers from retaining the event loop.
    this.child.stdin.destroy();
    this.child.stdout.destroy();
    this.child.stderr.destroy();
    // Frame handles already issued remain decodable after stopping the process.
    this.pending = Buffer.alloc(0);
    this.ids.clear();
  }
}

/** Full-screen Agent frame source; cropped native measurements are rejected. */
export class ObservationFrameSource extends NativeFrameTransport {
  // biome-ignore lint/complexity/noUselessConstructor: Hide the internal region transport argument from Agent callers.
  constructor(child: ChildProcessWithoutNullStreams, maxFrameBytes?: number) {
    super(child, maxFrameBytes);
  }
  static start(
    options: ObservationFrameProcessOptions,
  ): ObservationFrameSource {
    return new ObservationFrameSource(
      spawnObservationProcess(options),
      options.maxFrameBytes,
    );
  }
}

/** Output-local logical coordinates; outputWidth/Height are physical pixels.
 * Initial implementation deliberately rejects rotated/fractionally-scaled outputs. */
export interface RegionGeometry {
  outputIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  outputWidth: number;
  outputHeight: number;
  transform: 0;
}
export interface RegionMeasurementFrame {
  frameId: string;
  timing: NonNullable<DeviceFrameRef['timing']>;
  geometry: Readonly<RegionGeometry>;
  png: Buffer;
}
/** Independent bounded evidence channel. Intentionally NOT a DeviceFrameSource.
 * No screenshots are substituted into Agent actions; no inference is performed.
 * Any overflow, missing frame, clock/geometry change or premature EOF rejects evidence.
 */
export class RegionObservation {
  private readonly source: NativeFrameTransport;
  private readonly captured: RegionMeasurementFrame[] = [];
  private overflow = false;
  private constructor(
    options: ObservationFrameProcessOptions & {
      geometry: RegionGeometry;
      maxFrames: number;
    },
  ) {
    const geometry = Object.freeze({ ...options.geometry });
    if (
      (
        [
          'outputIndex',
          'x',
          'y',
          'width',
          'height',
          'scale',
          'outputWidth',
          'outputHeight',
          'transform',
        ] as const
      ).some(
        (key) => !Number.isSafeInteger(geometry[key]) || geometry[key] < 0,
      ) ||
      !geometry.width ||
      !geometry.height ||
      !geometry.scale ||
      geometry.transform !== 0 ||
      (geometry.x + geometry.width) * geometry.scale > geometry.outputWidth ||
      (geometry.y + geometry.height) * geometry.scale > geometry.outputHeight ||
      !Number.isSafeInteger(options.maxFrames) ||
      options.maxFrames < 1
    )
      throw new Error('Invalid region geometry or frame capacity');
    this.source = new NativeFrameTransport(
      spawnObservationProcess(options),
      options.maxFrameBytes,
      geometry,
    );
    this.source.subscribe((frame) => {
      if (this.captured.length >= options.maxFrames) {
        this.overflow = true;
        void this.source.stop();
        return;
      }
      this.captured.push({
        frameId: frame.frameId!,
        timing: { ...frame.timing! },
        geometry,
        png: Buffer.from(frame.ref as Buffer),
      });
    });
  }
  static start(
    options: ObservationFrameProcessOptions & {
      geometry: RegionGeometry;
      maxFrames: number;
    },
  ): RegionObservation {
    return new RegionObservation(options);
  }
  frames(): RegionMeasurementFrame[] {
    if (this.overflow)
      throw new Error('Region observation overflow; reject timing judgment');
    this.source.latest(); // propagate transport failures even after stopping
    return this.captured.map((frame) => ({
      ...frame,
      timing: { ...frame.timing },
      png: Buffer.from(frame.png),
    }));
  }
  async stop(): Promise<void> {
    await this.source.stop();
  }
}
