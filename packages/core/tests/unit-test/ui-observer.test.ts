import { UIObserver } from '@/agent/ui-observer';
import type { DeviceFrameRef, DeviceFrameSource } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import { describe, expect, it, vi } from 'vitest';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fakeRepresentative = (): UIContext =>
  ({
    screenshot: ScreenshotItem.create(
      'data:image/png;base64,iVBORw0KGgo-rep',
      9999,
    ),
    shotSize: { width: 100, height: 100 },
    shrunkShotToLogicalRatio: 1,
  }) as UIContext;

/** A fake frame source whose latest frame can be swapped from the test. */
const makeFakeSource = () => {
  let current: DeviceFrameRef | null = null;
  const decode = vi.fn(async (refs: DeviceFrameRef[]) =>
    refs.map((r) => `decoded:${String(r.ref)}`),
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
  const runAssert = vi.fn(async () => {});
  const runBoolean = vi.fn(async () => true);
  const screenshot = vi.fn(
    async () => 'data:image/png;base64,iVBORw0KGgo-shot',
  );
  return {
    deps: {
      openFrameSource: async () => fake?.source ?? undefined,
      screenshot,
      captureRepresentative: async () => fakeRepresentative(),
      runAssert,
      runBoolean,
    },
    runAssert,
    runBoolean,
    screenshot,
  };
};

describe('UIObserver', () => {
  it('rejects asserting before stop()', async () => {
    const fake = makeFakeSource();
    fake.setLatest('f0', 0);
    const { deps } = makeDeps(fake);
    const observer = new UIObserver(deps, { intervalMs: 200 });
    await observer.start();

    await expect(observer.aiAssert('anything')).rejects.toThrow(
      /stop\(\) before asserting/,
    );
    await observer.stop();
  });

  it('samples frame refs, defers decode to unique refs, and stops the source', async () => {
    const fake = makeFakeSource();
    fake.setLatest('f0', 0);
    const { deps, runAssert } = makeDeps(fake);
    const observer = new UIObserver(deps, { intervalMs: 200 });

    await observer.start(); // baseline frame captured
    fake.setLatest('f1', 100);
    await sleep(250);
    await observer.stop();

    expect(observer.frameCount).toBeGreaterThanOrEqual(2);
    // No decode during the observation window — only at assert time.
    expect(fake.decode).not.toHaveBeenCalled();

    await observer.aiAssert('a toast appeared');

    expect(fake.decode).toHaveBeenCalledTimes(1);
    const decodedRefs = fake.decode.mock.calls[0][0];
    // duplicates collapsed: decode is called with UNIQUE refs only
    const refValues = decodedRefs.map((r: DeviceFrameRef) => r.ref);
    expect(new Set(refValues).size).toBe(refValues.length);

    // the assert received a multi-frame context ending with the representative
    const uiContext = (runAssert.mock.calls[0] as any[])[1] as UIContext;
    const sequence = uiContext.screenshotSequence!;
    expect(sequence.length).toBeGreaterThanOrEqual(3);
    expect(sequence[0].base64).toBe('decoded:f0');
    expect(sequence[sequence.length - 1].base64).toBe(
      'data:image/png;base64,iVBORw0KGgo-rep',
    );
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  it('sends all buffered frames to the model (no down-sampling)', async () => {
    const fake = makeFakeSource();
    const { deps, runAssert } = makeDeps(fake);
    const observer = new UIObserver(deps, {
      intervalMs: 200,
      maxBufferedFrames: 30,
    });
    // inject 25 distinct frames directly (under the 30-frame buffer cap)
    for (let i = 0; i < 25; i++) {
      (observer as any).pushFrame({ ref: `f${i}`, capturedAt: i });
    }
    (observer as any).source = fake.source;
    (observer as any).stopped = true;
    (observer as any).representative = fakeRepresentative();

    await observer.aiAssert('anything');

    // all 25 buffered frames + 1 representative = 26 frames sent
    const uiContext = (runAssert.mock.calls[0] as any[])[1] as UIContext;
    expect(uiContext.screenshotSequence!.length).toBe(26);
    // decode was called with all 25 unique refs
    expect(fake.decode).toHaveBeenCalledTimes(1);
    expect(fake.decode.mock.calls[0][0]).toHaveLength(25);
  });

  it('thins the buffer instead of dropping the head when full', () => {
    const fake = makeFakeSource();
    const { deps } = makeDeps(fake);
    const observer = new UIObserver(deps, {
      intervalMs: 200,
      maxBufferedFrames: 10,
    });
    for (let i = 0; i < 16; i++) {
      (observer as any).pushFrame({ ref: `f${i}`, capturedAt: i });
    }
    const frames = (observer as any).frames as DeviceFrameRef[];
    expect(frames.length).toBeLessThanOrEqual(11);
    // the FIRST frame must survive thinning — early transient UI is the point
    expect(frames[0].ref).toBe('f0');
    // the latest frame is always present
    expect(frames[frames.length - 1].ref).toBe('f15');
  });

  it('falls back to plain screenshots when no frame source is available', async () => {
    const { deps, runAssert, screenshot } = makeDeps(null);
    const observer = new UIObserver(deps, { intervalMs: 200 });

    await observer.start();
    await sleep(250);
    await observer.stop();
    await observer.aiAssert('anything');

    expect(screenshot).toHaveBeenCalled();
    const uiContext = (runAssert.mock.calls[0] as any[])[1] as UIContext;
    expect(
      uiContext.screenshotSequence![0].base64.startsWith('data:image/png'),
    ).toBe(true);
  });

  it('falls back to screenshots when openFrameSource throws', async () => {
    const runAssert = vi.fn(async () => {});
    const screenshot = vi.fn(async () => 'data:image/png;base64,iVBORw0KGgo-x');
    const observer = new UIObserver(
      {
        openFrameSource: async () => {
          throw new Error('stream unavailable');
        },
        screenshot,
        captureRepresentative: async () => fakeRepresentative(),
        runAssert,
        runBoolean: async () => true,
      },
      { intervalMs: 200 },
    );

    await observer.start();
    await observer.stop();
    await observer.aiAssert('anything');
    expect(screenshot).toHaveBeenCalled();
  });

  it('stop() is idempotent and aiBoolean shares the observed context', async () => {
    const fake = makeFakeSource();
    fake.setLatest('f0', 0);
    const { deps, runBoolean } = makeDeps(fake);
    const observer = new UIObserver(deps, { intervalMs: 200 });
    await observer.start();
    await observer.stop();
    await observer.stop(); // no throw

    const result = await observer.aiBoolean('did anything appear?');
    expect(result).toBe(true);
    const uiContext = (runBoolean.mock.calls[0] as any[])[1] as UIContext;
    expect(uiContext.screenshotSequence!.length).toBeGreaterThanOrEqual(2);
  });
});
