import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { UIObserver } from '@/agent/ui-observer';
import type { DeviceFrameRef, DeviceFrameSource } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import { UIObservationRecordWriter } from '@midscene/shared/agent-tools/observation-record';
import { afterEach, describe, expect, it, vi } from 'vitest';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const createdDirectories: string[] = [];

function recordWriter(): UIObservationRecordWriter {
  const directory = mkdtempSync(join(tmpdir(), 'midscene-observer-'));
  createdDirectories.push(directory);
  return new UIObservationRecordWriter(join(directory, 'observation.json'));
}

function options(extra: Record<string, unknown> = {}) {
  return extra;
}

const fakeRepresentative = (): UIContext =>
  ({
    screenshot: ScreenshotItem.create(
      `data:image/png;base64,${Buffer.from('representative').toString('base64')}`,
      9999,
    ),
    shotSize: { width: 100, height: 100 },
    shrunkShotToLogicalRatio: 1,
  }) as UIContext;

const makeFakeSource = () => {
  let current: DeviceFrameRef | null = null;
  const decode = vi.fn(async (refs: DeviceFrameRef[]) =>
    refs.map(
      (frame) =>
        `data:image/png;base64,${Buffer.from(`decoded:${String(frame.ref)}`).toString('base64')}`,
    ),
  );
  const stop = vi.fn();
  const source: DeviceFrameSource = {
    latest: () => current,
    decode,
    stop,
  };
  return {
    source,
    decode,
    stop,
    setLatest(ref: string, capturedAt: number) {
      current = { ref, capturedAt };
    },
  };
};

const makeDeps = (fake: ReturnType<typeof makeFakeSource> | null) => {
  const screenshot = vi.fn(
    async () =>
      `data:image/png;base64,${Buffer.from('fallback').toString('base64')}`,
  );
  const onStopped = vi.fn();
  return {
    deps: {
      openFrameSource: async () => fake?.source ?? undefined,
      screenshot,
      captureRepresentative: async () => fakeRepresentative(),
      onStopped,
      observationRecordWriter: recordWriter(),
    },
    screenshot,
    onStopped,
  };
};

function frameContents(path: string): string {
  return readFileSync(path).toString('utf8');
}

describe('UIObserver', () => {
  afterEach(() => {
    vi.useRealTimers();
    for (const directory of createdDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects exporting before stop()', async () => {
    const fake = makeFakeSource();
    fake.setLatest('f0', 0);
    const { deps } = makeDeps(fake);
    const observer = new UIObserver(deps, options({ intervalMs: 200 }));
    await observer.start();

    await expect(observer.exportRecord()).rejects.toThrow(
      /stop\(\) before exporting/,
    );
    await observer.stop();
  });

  it('persists source frames, aligns the representative, and stops the source', async () => {
    const fake = makeFakeSource();
    fake.setLatest('f0', 0);
    const { deps, onStopped } = makeDeps(fake);
    const observer = new UIObserver(deps, options({ intervalMs: 200 }));

    await observer.start();
    fake.setLatest('f1', 100);
    await sleep(250);
    await observer.stop();
    const record = await observer.exportRecord();

    expect(observer.frameCount).toBeGreaterThanOrEqual(2);
    expect(onStopped).toHaveBeenCalledOnce();
    expect(fake.stop).toHaveBeenCalledOnce();
    expect(record.frames.length).toBeGreaterThanOrEqual(3);
    expect(frameContents(record.frames[0].path)).toBe('decoded:f0');
    expect(frameContents(record.frames.at(-1)!.path)).toBe('decoded:f1');
    expect(record.frames[0]).not.toHaveProperty('base64');
  });

  it('decodes opaque source handles in bounded batches and reuses the export', async () => {
    const fake = makeFakeSource();
    const { deps } = makeDeps(fake);
    const observer = new UIObserver(
      deps,
      options({ intervalMs: 200, maxFrames: 30 }),
    );
    for (let index = 0; index < 10; index++) {
      (observer as any).pushFrame({ ref: `f${index}`, capturedAt: index });
    }
    (observer as any).source = fake.source;
    (observer as any).stopped = true;
    (observer as any).representative = fakeRepresentative();

    const firstRecord = await observer.exportRecord();
    const secondRecord = await observer.exportRecord();

    expect(firstRecord).toBe(secondRecord);
    expect(fake.decode).toHaveBeenCalledTimes(3);
    expect(fake.decode.mock.calls.every(([batch]) => batch.length <= 4)).toBe(
      true,
    );
    expect(firstRecord.frames).toHaveLength(11);
  });

  it('exports every buffered frame up to the configured cap', async () => {
    const fake = makeFakeSource();
    const { deps } = makeDeps(fake);
    const observer = new UIObserver(
      deps,
      options({ intervalMs: 200, maxFrames: 30 }),
    );
    for (let index = 0; index < 25; index++) {
      (observer as any).pushFrame({ ref: `f${index}`, capturedAt: index });
    }
    (observer as any).source = fake.source;
    (observer as any).stopped = true;
    (observer as any).representative = fakeRepresentative();

    const record = await observer.exportRecord();

    expect(record.frames).toHaveLength(26);
    expect(fake.decode.mock.calls.flatMap(([frames]) => frames)).toHaveLength(
      25,
    );
  });

  it('smart thinning preserves change points and temporal endpoints', () => {
    const fake = makeFakeSource();
    const { deps } = makeDeps(fake);
    const observer = new UIObserver(
      deps,
      options({ intervalMs: 200, maxFrames: 10 }),
    );
    const refs = [
      'a',
      'a',
      'a',
      'a',
      'a',
      'b',
      'b',
      'b',
      'b',
      'b',
      'c',
      'c',
      'c',
      'c',
      'c',
      'c',
    ];
    refs.forEach((ref, capturedAt) =>
      (observer as any).pushFrame({ ref, capturedAt }),
    );

    const frames = (observer as any).frames as DeviceFrameRef[];
    expect(frames.map((frame) => frame.ref)).toEqual(
      expect.arrayContaining(['a', 'b', 'c']),
    );
    expect(frames[0].ref).toBe('a');
    expect(frames.at(-1)!.ref).toBe('c');
  });

  it('enforces maxFrames even when every frame is a change point', () => {
    const fake = makeFakeSource();
    const { deps } = makeDeps(fake);
    const observer = new UIObserver(
      deps,
      options({ intervalMs: 200, maxFrames: 10 }),
    );
    for (let index = 0; index < 16; index++) {
      (observer as any).pushFrame({ ref: `frame-${index}`, capturedAt: index });
    }

    const frames = (observer as any).frames as DeviceFrameRef[];
    expect(frames).toHaveLength(10);
    expect(frames[0].ref).toBe('frame-0');
    expect(frames.at(-1)!.ref).toBe('frame-15');
  });

  it('prunes persisted image files when the frame buffer is thinned', () => {
    const fake = makeFakeSource();
    const { deps } = makeDeps(fake);
    const writer = deps.observationRecordWriter;
    const observer = new UIObserver(
      deps,
      options({ intervalMs: 200, maxFrames: 2 }),
    );

    for (let index = 0; index < 12; index++) {
      const persisted = writer.persistFrame(
        `data:image/png;base64,${Buffer.from(`frame-${index}`).toString('base64')}`,
        index,
      );
      (observer as any).pushFrame({
        ref: persisted.path,
        capturedAt: index,
        persisted,
      });
    }

    const retainedFrames = (observer as any).frames as Array<{
      persisted: { path: string };
    }>;
    const framesDirectory = dirname(
      writer.resolveFramePath(retainedFrames[0].persisted as any),
    );
    expect(retainedFrames).toHaveLength(2);
    expect(readdirSync(framesDirectory)).toHaveLength(2);
  });

  it('disposes the file-backed record after it is no longer needed', async () => {
    const fake = makeFakeSource();
    const { deps } = makeDeps(fake);
    const observer = new UIObserver(deps, options({ intervalMs: 200 }));
    const persisted = deps.observationRecordWriter.persistFrame(
      `data:image/png;base64,${Buffer.from('frame').toString('base64')}`,
      100,
    );
    (observer as any).pushFrame({
      ref: persisted.path,
      capturedAt: 100,
      persisted,
    });
    (observer as any).stopped = true;
    (observer as any).representative = fakeRepresentative();

    const record = await observer.exportRecord();
    expect(readFileSync(record.frames[0].path)).toBeDefined();

    await observer.dispose();

    expect(() => readFileSync(record.frames[0].path)).toThrow();
    await expect(observer.exportRecord()).rejects.toThrow(/disposed/);
  });

  it('watchdog auto-stops and can also be disabled', async () => {
    vi.useFakeTimers();
    const fake = makeFakeSource();
    fake.setLatest('f0', 0);
    const first = makeDeps(fake);
    const observer = new UIObserver(
      first.deps,
      options({ intervalMs: 200, watchdogMs: 5000 }),
    );
    await observer.start();
    vi.advanceTimersByTime(5000);
    await vi.runAllTimersAsync();
    expect(first.onStopped).toHaveBeenCalledOnce();

    const secondFake = makeFakeSource();
    secondFake.setLatest('f0', 0);
    const second = makeDeps(secondFake);
    const disabled = new UIObserver(
      second.deps,
      options({ intervalMs: 200, watchdogMs: 0 }),
    );
    await disabled.start();
    vi.advanceTimersByTime(60000);
    await Promise.resolve();
    expect(second.onStopped).not.toHaveBeenCalled();
    await disabled.stop();
  });

  it('warns without dropping records over the soft frame limit', async () => {
    const fake = makeFakeSource();
    const { deps } = makeDeps(fake);
    const observer = new UIObserver(
      deps,
      options({ intervalMs: 200, maxFrames: 60 }),
    );
    for (let index = 0; index < 55; index++) {
      (observer as any).pushFrame({ ref: `f${index}`, capturedAt: index });
    }
    (observer as any).source = fake.source;
    (observer as any).stopped = true;
    (observer as any).representative = fakeRepresentative();

    const record = await observer.exportRecord();
    expect(record.frames).toHaveLength(56);
  });

  it('persists fallback screenshots immediately as files', async () => {
    const { deps, screenshot } = makeDeps(null);
    const observer = new UIObserver(deps, options({ intervalMs: 200 }));
    await observer.start();
    await sleep(250);
    await observer.stop();
    const record = await observer.exportRecord();

    expect(screenshot).toHaveBeenCalled();
    expect(frameContents(record.frames[0].path)).toBe('fallback');
    expect((observer as any).frames[0].ref).not.toContain('base64');
  });

  it('falls back when opening the frame source throws', async () => {
    const screenshot = vi.fn(
      async () =>
        `data:image/png;base64,${Buffer.from('fallback').toString('base64')}`,
    );
    const observer = new UIObserver(
      {
        openFrameSource: async () => {
          throw new Error('stream unavailable');
        },
        screenshot,
        captureRepresentative: async () => fakeRepresentative(),
        observationRecordWriter: recordWriter(),
      },
      options({ intervalMs: 200 }),
    );
    await observer.start();
    await observer.stop();
    await observer.exportRecord();
    expect(screenshot).toHaveBeenCalled();
  });

  it('stop and export are idempotent', async () => {
    const fake = makeFakeSource();
    fake.setLatest('f0', 0);
    const { deps, onStopped } = makeDeps(fake);
    const observer = new UIObserver(deps, options({ intervalMs: 200 }));
    await observer.start();
    await observer.stop();
    await observer.stop();
    const first = await observer.exportRecord();
    const second = await observer.exportRecord();

    expect(onStopped).toHaveBeenCalledOnce();
    expect(second).toBe(first);
  });

  it('concurrent stop calls wait for the same finalization', async () => {
    const fake = makeFakeSource();
    fake.setLatest('f0', 0);
    let finishRepresentative: (() => void) | undefined;
    const representativeReady = new Promise<void>((resolve) => {
      finishRepresentative = resolve;
    });
    const { deps, onStopped } = makeDeps(fake);
    deps.captureRepresentative = async () => {
      await representativeReady;
      return fakeRepresentative();
    };
    const observer = new UIObserver(deps, options({ intervalMs: 200 }));
    await observer.start();

    const firstStop = observer.stop();
    const secondStop = observer.stop();
    finishRepresentative?.();
    await Promise.all([firstStop, secondStop]);

    await expect(observer.exportRecord()).resolves.toMatchObject({
      type: 'midscene_ui_observation',
      version: 1,
    });
    expect(onStopped).toHaveBeenCalledOnce();
  });
});
