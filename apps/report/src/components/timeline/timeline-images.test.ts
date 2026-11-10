import { afterEach, describe, expect, it, rs } from '@rstest/core';
import {
  loadTimelineImageGroup,
  loadTimelineThumbnail,
  prepareTimelineImageGroups,
  selectTimelineImageGroups,
} from './timeline-images';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('timeline image preparation', () => {
  it('prepares every unique image together for ordinary reports', () => {
    expect(
      selectTimelineImageGroups(
        [
          { img: 'a', x: 0 },
          { img: 'a', x: 1 },
          { img: 'b', x: 2 },
        ],
        40,
      ),
    ).toEqual({ initial: ['a', 'b'], background: [] });
    expect(selectTimelineImageGroups([], 40)).toEqual({
      initial: [],
      background: [],
    });
  });

  it('prioritizes visible representatives but still prepares every image in long reports', () => {
    const screenshots = Array.from({ length: 200 }, (_, index) => ({
      img: `image-${index}`,
      x: index * 2,
    }));
    const { initial, background } = selectTimelineImageGroups(screenshots, 40);
    expect(initial).toHaveLength(11);
    expect(initial).toContain('image-0');
    expect(initial).toContain('image-199');
    expect(background).toHaveLength(189);
    expect(new Set([...initial, ...background]).size).toBe(200);
    expect(background.every((url) => !initial.includes(url))).toBe(true);
  });

  it('limits concurrent work, deduplicates URLs and waits for the final image before publishing', async () => {
    const pending = Array.from({ length: 8 }, () => deferred<string>());
    const load = rs.fn((url: string) => pending[Number(url)].promise);
    let published = false;
    const result = loadTimelineImageGroup(
      ['0', '0', '1', '2', '3', '4', '5', '6', '7'],
      load,
      new AbortController().signal,
    ).then((images) => {
      published = true;
      return images;
    });
    expect(load).toHaveBeenCalledTimes(6);

    pending[3].resolve('three');
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(7);
    expect(published).toBe(false);
    pending[0].resolve('zero');
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(8);

    for (const index of [1, 2, 4, 5, 6]) pending[index].resolve(`${index}`);
    await Promise.resolve();
    expect(published).toBe(false);
    pending[7].resolve('seven');
    const { images, failures } = await result;
    expect(images.size).toBe(8);
    expect(images.get('3')).toBe('three');
    expect(failures.size).toBe(0);
  });

  it('reports failed images without preventing successful images from appearing', async () => {
    const error = new Error('missing screenshot');
    const { images, failures } = await loadTimelineImageGroup(
      ['good', 'bad', 'another'],
      async (url) => {
        if (url === 'bad') throw error;
        return url;
      },
      new AbortController().signal,
    );
    expect([...images.keys()]).toEqual(['good', 'another']);
    expect(failures.get('bad')).toBe(error);
  });

  it('stops scheduling images and does not publish an abandoned report', async () => {
    const controller = new AbortController();
    const pending = deferred<string>();
    const load = rs.fn(() => pending.promise);
    const result = loadTimelineImageGroup(
      Array.from({ length: 20 }, (_, index) => `${index}`),
      load,
      controller.signal,
    );
    const rejected = expect(result).rejects.toMatchObject({
      name: 'AbortError',
    });
    controller.abort();
    pending.resolve('loaded');
    await rejected;
    expect(load).toHaveBeenCalledTimes(6);
  });

  it('publishes representatives together and only publishes the remainder once it is complete', async () => {
    const pending = Array.from({ length: 4 }, () => deferred<string>());
    const load = rs.fn((url: string) => pending[Number(url)].promise);
    const publish = rs.fn();
    const prepared = prepareTimelineImageGroups(
      { initial: ['0', '1'], background: ['2', '3'] },
      load,
      new AbortController().signal,
      publish,
    );
    pending[0].resolve('zero');
    await Promise.resolve();
    expect(publish).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(2);
    pending[1].resolve('one');
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(publish).toHaveBeenCalledTimes(1);
    expect([...publish.mock.calls[0][0].images.values()]).toEqual([
      'zero',
      'one',
    ]);
    expect(publish.mock.calls[0][0].complete).toBe(false);
    pending[2].resolve('two');
    await Promise.resolve();
    expect(publish).toHaveBeenCalledTimes(1);
    pending[3].resolve('three');
    await prepared;
    expect(publish).toHaveBeenCalledTimes(2);
    expect([...publish.mock.calls[1][0].images.values()]).toEqual([
      'zero',
      'one',
      'two',
      'three',
    ]);
    expect(publish.mock.calls[1][0].complete).toBe(true);
  });

  it('does not load or publish background frames after a timeline is abandoned', async () => {
    const controller = new AbortController();
    const load = rs.fn(async (url: string) => url);
    const publish = rs.fn(() => controller.abort());
    await expect(
      prepareTimelineImageGroups(
        { initial: ['first'], background: ['next'] },
        load,
        controller.signal,
        publish,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(load).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
  });
});

describe('timeline thumbnails', () => {
  afterEach(() => {
    rs.unstubAllGlobals();
    rs.useRealTimers();
  });

  function mockImageAndCanvas() {
    const images: FakeImage[] = [];
    class FakeImage {
      naturalWidth = 1920;
      naturalHeight = 1080;
      src = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      removeAttribute = rs.fn();
      constructor() {
        images.push(this);
      }
    }
    const drawImage = rs.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: rs.fn(() => ({ drawImage })),
    };
    rs.stubGlobal('Image', FakeImage);
    rs.stubGlobal('document', { createElement: rs.fn(() => canvas) });
    return { images, canvas, drawImage };
  }

  it('caches a thumbnail at timeline size instead of the original decoded image', async () => {
    const { images, canvas, drawImage } = mockImageAndCanvas();
    const result = loadTimelineThumbnail(
      'screenshot.png',
      136,
      new AbortController().signal,
    );
    expect(images[0].src).toBe('screenshot.png');
    images[0].onload!();
    expect(await result).toEqual({ canvas, width: 242, height: 136 });
    expect(canvas.width).toBe(242);
    expect(canvas.height).toBe(136);
    expect(drawImage).toHaveBeenCalledWith(images[0], 0, 0, 242, 136);
    expect(images[0].onload).toBeNull();
  });

  it('rejects invalid screenshots instead of caching an empty canvas', async () => {
    const { images } = mockImageAndCanvas();
    const result = loadTimelineThumbnail(
      'broken.png',
      136,
      new AbortController().signal,
    );
    images[0].naturalHeight = 0;
    images[0].onload!();
    await expect(result).rejects.toThrow('invalid dimensions');
  });

  it('cancels in-flight image loading when the timeline is removed', async () => {
    const { images } = mockImageAndCanvas();
    const controller = new AbortController();
    const result = loadTimelineThumbnail(
      'screenshot.png',
      136,
      controller.signal,
    );
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(images[0].removeAttribute).toHaveBeenCalledWith('src');
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
  });

  it('times out stalled images so one request cannot hold the entire timeline', async () => {
    rs.useFakeTimers();
    const { images } = mockImageAndCanvas();
    const result = loadTimelineThumbnail(
      'stalled.png',
      136,
      new AbortController().signal,
    );
    const rejected = expect(result).rejects.toThrow('loading timed out');
    await rs.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(images[0].removeAttribute).toHaveBeenCalledWith('src');
  });
});
