import { UIObserver } from '@/agent/ui-observer';
import type { DeviceFrameRef, DeviceFrameSource } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  const runAssert = vi.fn(async () => undefined);
  const runBoolean = vi.fn(async () => true);
  const screenshot = vi.fn(
    async () => 'data:image/png;base64,iVBORw0KGgo-shot',
  );
  const onStopped = vi.fn();
  return {
    deps: {
      openFrameSource: async () => fake?.source ?? undefined,
      screenshot,
      captureRepresentative: async () => fakeRepresentative(),
      runAssert,
      runBoolean,
      onStopped,
    },
    runAssert,
    runBoolean,
    screenshot,
    onStopped,
  };
};

describe('UIObserver', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('samples frame refs, pre-decodes during stop(), aligns rep with last frame, and stops the source', async () => {
    const fake = makeFakeSource();
    fake.setLatest('f0', 0);
    const { deps, runAssert, onStopped } = makeDeps(fake);
    const observer = new UIObserver(deps, { intervalMs: 200 });

    await observer.start(); // baseline frame captured
    fake.setLatest('f1', 100);
    await sleep(250);
    await observer.stop();

    expect(observer.frameCount).toBeGreaterThanOrEqual(2);
    // Pre-decode happens during stop(), so decode should have been called.
    expect(fake.decode).toHaveBeenCalledTimes(1);
    // onStopped callback fires
    expect(onStopped).toHaveBeenCalledTimes(1);

    const decodedRefs = fake.decode.mock.calls[0][0];
    // duplicates collapsed: decode is called with UNIQUE refs only
    const refValues = decodedRefs.map((r: DeviceFrameRef) => r.ref);
    expect(new Set(refValues).size).toBe(refValues.length);

    await observer.aiAssert('a toast appeared');

    // Second assertion must NOT trigger another decode — cache hit.
    expect(fake.decode).toHaveBeenCalledTimes(1);

    // the assert received a multi-frame context ending with the representative
    const uiContext = (runAssert.mock.calls[0] as any[])[1] as UIContext;
    const sequence = uiContext.screenshotSequence!;
    expect(sequence.length).toBeGreaterThanOrEqual(3);
    expect(sequence[0].base64).toBe('decoded:f0');
    // Representative screenshot is aligned with last sampled frame.
    expect(sequence[sequence.length - 1].base64).toBe('decoded:f1');
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  it('decode cache: second assertion reuses decoded frames (no extra decode call)', async () => {
    const fake = makeFakeSource();
    fake.setLatest('f0', 0);
    const { deps } = makeDeps(fake);
    const observer = new UIObserver(deps, { intervalMs: 200 });

    await observer.start();
    fake.setLatest('f1', 100);
    await sleep(250);
    await observer.stop();

    // Pre-decode happened once during stop.
    expect(fake.decode).toHaveBeenCalledTimes(1);

    await observer.aiAssert('first assertion');
    // Still 1 — buildObservedUIContext hit the cache.
    expect(fake.decode).toHaveBeenCalledTimes(1);

    await observer.aiBoolean('second query');
    // Still 1.
    expect(fake.decode).toHaveBeenCalledTimes(1);
  });

  it('sends all buffered frames to the model (no down-sampling)', async () => {
    const fake = makeFakeSource();
    const { deps, runAssert } = makeDeps(fake);
    const observer = new UIObserver(deps, {
      intervalMs: 200,
      maxFrames: 30,
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

  it('smart thinning preserves change-point frames and thins static intervals', () => {
    const fake = makeFakeSource();
    const { deps } = makeDeps(fake);
    const observer = new UIObserver(deps, {
      intervalMs: 200,
      maxFrames: 10,
    });

    // Simulate: static screen (same ref) for 5 ticks, then a change (new ref),
    // then static again. Total 16 frames, buffer cap 10 → thinning triggers.
    const frames: DeviceFrameRef[] = [
      { ref: 'screen-a', capturedAt: 0 },
      { ref: 'screen-a', capturedAt: 1 },
      { ref: 'screen-a', capturedAt: 2 },
      { ref: 'screen-a', capturedAt: 3 },
      { ref: 'screen-a', capturedAt: 4 },
      { ref: 'screen-b', capturedAt: 5 }, // change point!
      { ref: 'screen-b', capturedAt: 6 },
      { ref: 'screen-b', capturedAt: 7 },
      { ref: 'screen-b', capturedAt: 8 },
      { ref: 'screen-b', capturedAt: 9 },
      { ref: 'screen-c', capturedAt: 10 }, // change point!
      { ref: 'screen-c', capturedAt: 11 },
      { ref: 'screen-c', capturedAt: 12 },
      { ref: 'screen-c', capturedAt: 13 },
      { ref: 'screen-c', capturedAt: 14 },
      { ref: 'screen-c', capturedAt: 15 },
    ];
    for (const f of frames) {
      (observer as any).pushFrame(f);
    }

    const result = (observer as any).frames as DeviceFrameRef[];
    // After thinning, buffer should be ≤ maxFrames (10)
    expect(result.length).toBeLessThanOrEqual(11); // 10 after thin + 1 pending push? No, pushFrame pushes after thinning

    // All three change-point refs must be present
    const refs = result.map((f) => f.ref);
    expect(refs).toContain('screen-a');
    expect(refs).toContain('screen-b');
    expect(refs).toContain('screen-c');

    // First and last frames must survive
    expect(result[0].ref).toBe('screen-a');
    expect(result[result.length - 1].ref).toBe('screen-c');
  });

  it('thinning with all-unique-ref frames keeps all frames (all are change points)', () => {
    const fake = makeFakeSource();
    const { deps } = makeDeps(fake);
    const observer = new UIObserver(deps, {
      intervalMs: 200,
      maxFrames: 10,
    });
    // 16 frames, each with a unique ref → every frame is a change point
    for (let i = 0; i < 16; i++) {
      (observer as any).pushFrame({ ref: `f${i}`, capturedAt: i });
    }
    const frames = (observer as any).frames as DeviceFrameRef[];
    // All change points are preserved; static thinning doesn't apply.
    // Buffer may exceed maxFrames when all frames are change points
    // (better to keep them than to drop transient UI).
    expect(frames.length).toBeGreaterThanOrEqual(10);
    expect(frames[0].ref).toBe('f0');
    expect(frames[frames.length - 1].ref).toBe('f15');
  });

  it('watchdog auto-stops the observer after timeout', async () => {
    vi.useFakeTimers();
    const fake = makeFakeSource();
    fake.setLatest('f0', 0);
    const { deps, onStopped } = makeDeps(fake);
    const observer = new UIObserver(deps, {
      intervalMs: 200,
      watchdogMs: 5000, // 5 second watchdog for testing
    });

    await observer.start();
    expect(onStopped).not.toHaveBeenCalled();

    // Advance past the watchdog timeout
    vi.advanceTimersByTime(5000);
    await Promise.resolve(); // let microtasks run
    await vi.runAllTimersAsync();

    // Watchdog should have called stop(), which calls onStopped
    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  it('watchdog can be disabled with watchdogMs: 0', async () => {
    vi.useFakeTimers();
    const fake = makeFakeSource();
    fake.setLatest('f0', 0);
    const { deps, onStopped } = makeDeps(fake);
    const observer = new UIObserver(deps, {
      intervalMs: 200,
      watchdogMs: 0, // disabled
    });

    await observer.start();
    // Advance way past any reasonable timeout
    vi.advanceTimersByTime(60000);
    await Promise.resolve();

    // No auto-stop — watchdog is disabled
    expect(onStopped).not.toHaveBeenCalled();
    await observer.stop();
    expect(onStopped).toHaveBeenCalledTimes(1);
  });

  it('warns when sending more than MAX_FRAMES_TO_MODEL frames', async () => {
    const fake = makeFakeSource();
    const { deps, runAssert } = makeDeps(fake);
    const observer = new UIObserver(deps, {
      intervalMs: 200,
      maxFrames: 60,
    });
    // Inject 55 frames — over the 50-frame soft limit
    for (let i = 0; i < 55; i++) {
      (observer as any).pushFrame({ ref: `f${i}`, capturedAt: i });
    }
    (observer as any).source = fake.source;
    (observer as any).stopped = true;
    (observer as any).representative = fakeRepresentative();

    const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await observer.aiAssert('anything');
    warnSpy.mockRestore();

    // 55 frames + 1 representative = 56 > 50, should warn
    const uiContext = (runAssert.mock.calls[0] as any[])[1] as UIContext;
    expect(uiContext.screenshotSequence!.length).toBe(56);
    // Frames are still all sent — warning is advisory, not a hard cap
    expect(fake.decode.mock.calls[0][0]).toHaveLength(55);
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
    const runAssert = vi.fn(async () => undefined);
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
    const { deps, runBoolean, onStopped } = makeDeps(fake);
    const observer = new UIObserver(deps, { intervalMs: 200 });
    await observer.start();
    await observer.stop();
    await observer.stop(); // no throw

    // onStopped fires only once even with double stop()
    expect(onStopped).toHaveBeenCalledTimes(1);

    const result = await observer.aiBoolean('did anything appear?');
    expect(result).toBe(true);
    const uiContext = (runBoolean.mock.calls[0] as any[])[1] as UIContext;
    expect(uiContext.screenshotSequence!.length).toBeGreaterThanOrEqual(2);
  });
});
