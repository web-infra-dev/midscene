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

/** Opt-in native NDJSON transport. Source times survive buffering and PNG decoding. */
export class ObservationFrameSource implements DeviceFrameSource {
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
  ) {
    if (!Number.isInteger(maxFrameBytes) || maxFrameBytes < 1)
      throw new Error('Invalid frame byte limit');
    this.maxFrameBytes = maxFrameBytes;
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

  static start(
    options: ObservationFrameProcessOptions,
  ): ObservationFrameSource {
    return new ObservationFrameSource(
      spawn(options.command, options.args ?? [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
      options.maxFrameBytes,
    );
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
