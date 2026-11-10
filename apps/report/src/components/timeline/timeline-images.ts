const FULL_PRELOAD_IMAGE_LIMIT = 120;
const IMAGE_LOAD_CONCURRENCY = 6;
const IMAGE_LOAD_TIMEOUT_MS = 15_000;

export interface TimelineThumbnail {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/** Large reports first prepare one representative image per visible pixel bucket. */
export function selectTimelineImageGroups(
  screenshots: readonly { img: string; x: number }[],
  bucketWidth: number,
): { initial: string[]; background: string[] } {
  const urls = [
    ...new Set(screenshots.map((shot) => shot.img).filter(Boolean)),
  ];
  if (urls.length <= FULL_PRELOAD_IMAGE_LIMIT) {
    return { initial: urls, background: [] };
  }

  const buckets = new Map<number, string>();
  for (const shot of screenshots) {
    if (shot.img) buckets.set(Math.floor(shot.x / bucketWidth), shot.img);
  }
  const initial = new Set([
    urls[0],
    ...buckets.values(),
    urls[urls.length - 1],
  ]);
  return {
    initial: [...initial],
    background: urls.filter((url) => !initial.has(url)),
  };
}

/** Return a group only after every image settles, allowing one atomic canvas update. */
export async function loadTimelineImageGroup<T>(
  urls: readonly string[],
  load: (url: string) => Promise<T>,
  signal: AbortSignal,
): Promise<{ images: Map<string, T>; failures: Map<string, unknown> }> {
  const uniqueUrls = [...new Set(urls)];
  const images = new Map<string, T>();
  const failures = new Map<string, unknown>();
  let nextIndex = 0;

  await Promise.all(
    Array.from(
      { length: Math.min(IMAGE_LOAD_CONCURRENCY, uniqueUrls.length) },
      async () => {
        while (!signal.aborted && nextIndex < uniqueUrls.length) {
          const url = uniqueUrls[nextIndex++];
          try {
            images.set(url, await load(url));
          } catch (error) {
            failures.set(url, error);
          }
        }
      },
    ),
  );
  signal.throwIfAborted();
  return { images, failures };
}

/** Publish only complete groups, with the second publication containing every frame. */
export async function prepareTimelineImageGroups<T>(
  groups: { initial: string[]; background: string[] },
  load: (url: string) => Promise<T>,
  signal: AbortSignal,
  publish: (result: {
    images: Map<string, T>;
    failures: Map<string, unknown>;
    complete: boolean;
  }) => void,
) {
  let images = new Map<string, T>();
  let failures = new Map<string, unknown>();
  const stages = groups.background.length
    ? [groups.initial, groups.background]
    : [groups.initial];
  for (const [index, urls] of stages.entries()) {
    const group = await loadTimelineImageGroup(urls, load, signal);
    signal.throwIfAborted();
    images = new Map([...images, ...group.images]);
    failures = new Map([...failures, ...group.failures]);
    publish({ images, failures, complete: index === stages.length - 1 });
  }
}

/** Retain a small canvas rather than the full-resolution decoded screenshot. */
export function loadTimelineThumbnail(
  src: string,
  height: number,
  signal: AbortSignal,
): Promise<TimelineThumbnail> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const img = new Image();
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      img.onload = null;
      img.onerror = null;
    };
    const fail = (error: unknown) => {
      cleanup();
      img.removeAttribute('src');
      reject(error);
    };
    const onAbort = () => fail(signal.reason);
    const timeout = setTimeout(
      () => fail(new Error('Timeline screenshot loading timed out')),
      IMAGE_LOAD_TIMEOUT_MS,
    );
    signal.addEventListener('abort', onAbort, { once: true });
    img.onerror = () => fail(new Error('Failed to load timeline screenshot'));
    img.onload = () => {
      try {
        if (!img.naturalWidth || !img.naturalHeight) {
          throw new Error('Timeline screenshot has invalid dimensions');
        }
        const thumbnailHeight = Math.max(1, Math.round(height));
        const width = Math.max(
          1,
          Math.round((thumbnailHeight / img.naturalHeight) * img.naturalWidth),
        );
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = thumbnailHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Unable to create a timeline thumbnail canvas');
        }
        context.drawImage(img, 0, 0, width, thumbnailHeight);
        cleanup();
        resolve({ canvas, width, height: thumbnailHeight });
      } catch (error) {
        fail(error);
      }
    };
    img.src = src;
  });
}
