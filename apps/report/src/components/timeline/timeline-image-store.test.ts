import { describe, expect, it, rs } from '@rstest/core';
import { TimelineImageStore } from './timeline-image-store';
import type { TimelineThumbnail } from './timeline-images';

const thumbnail = (width = 2): TimelineThumbnail => ({
  canvas: {} as HTMLCanvasElement,
  width,
  height: 2,
});
function deferred() {
  let resolve!: (value: TimelineThumbnail) => void;
  const promise = new Promise<TimelineThumbnail>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe('shared timeline image store', () => {
  it('shares one concurrency limit across different timelines', async () => {
    const pending = Array.from({ length: 12 }, deferred);
    const load = rs.fn((src: string) => pending[Number(src)].promise);
    const store = new TimelineImageStore(load);
    const a = new AbortController();
    const b = new AbortController();
    const results = Array.from({ length: 12 }, (_, i) =>
      store.load(`${i}`, 136, i < 6 ? a.signal : b.signal),
    );
    await flush();
    expect(load).toHaveBeenCalledTimes(6);
    pending[0].resolve(thumbnail());
    await flush();
    expect(load).toHaveBeenCalledTimes(7);
    for (const item of pending) item.resolve(thumbnail());
    await Promise.all(results);
    expect(load).toHaveBeenCalledTimes(12);
  });

  it('deduplicates in-flight images without cancelling another timeline using the same image', async () => {
    const pending = deferred();
    const load = rs.fn(
      (_src: string, _height: number, _signal: AbortSignal) => pending.promise,
    );
    const store = new TimelineImageStore(load);
    const a = new AbortController();
    const b = new AbortController();
    const first = store.load('same', 136, a.signal);
    const second = store.load('same', 136, b.signal);
    const rejected = expect(first).rejects.toMatchObject({
      name: 'AbortError',
    });
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    a.abort();
    await rejected;
    expect(load.mock.calls[0][2].aborted).toBe(false);
    const image = thumbnail();
    pending.resolve(image);
    expect(await second).toBe(image);
    expect(await store.load('same', 136, new AbortController().signal)).toBe(
      image,
    );
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('cancels abandoned requests and removes queued images before loading them', async () => {
    const pending = deferred();
    const load = rs.fn(
      (_src: string, _height: number, _signal: AbortSignal) => pending.promise,
    );
    const store = new TimelineImageStore(load, 1);
    const controller = new AbortController();
    const active = store.load('active', 136, controller.signal);
    const queued = store.load('queued', 136, controller.signal);
    const activeRejected = expect(active).rejects.toMatchObject({
      name: 'AbortError',
    });
    const queuedRejected = expect(queued).rejects.toMatchObject({
      name: 'AbortError',
    });
    await flush();
    controller.abort();
    await Promise.all([activeRejected, queuedRejected]);
    expect(load.mock.calls[0][2].aborted).toBe(true);
    pending.resolve(thumbnail());
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    await store.load('active', 136, new AbortController().signal);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('evicts old cached thumbnails when the memory budget is reached', async () => {
    const load = rs.fn(async () => thumbnail());
    const store = new TimelineImageStore(load, 6, 40);
    const signal = new AbortController().signal;
    await store.load('a', 2, signal);
    await store.load('a', 2, signal);
    expect(load).toHaveBeenCalledTimes(1);
    await store.load('b', 2, signal);
    await store.load('a', 2, signal);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('keeps different thumbnail sizes separate and reuses failures', async () => {
    const error = new Error('missing image');
    const load = rs.fn(async (src: string) => {
      if (src === 'bad') throw error;
      return thumbnail();
    });
    const store = new TimelineImageStore(load);
    const signal = new AbortController().signal;
    await store.load('good', 100, signal);
    await store.load('good', 136, signal);
    await expect(store.load('bad', 136, signal)).rejects.toBe(error);
    await expect(store.load('bad', 136, signal)).rejects.toBe(error);
    expect(load).toHaveBeenCalledTimes(3);
  });
});
