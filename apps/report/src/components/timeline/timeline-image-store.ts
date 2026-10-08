import {
  type TimelineThumbnail,
  loadTimelineThumbnail,
} from './timeline-images';

type ThumbnailLoader = typeof loadTimelineThumbnail;
type Subscriber = {
  resolve(value: TimelineThumbnail): void;
  reject(error: unknown): void;
  cleanup(): void;
};
type PendingImage = {
  key: string;
  src: string;
  height: number;
  controller: AbortController;
  subscribers: Set<Subscriber>;
};
type CachedImage = {
  thumbnail?: TimelineThumbnail;
  error?: unknown;
  bytes: number;
};

/** One queue and bounded cache for every timeline in this report, including embedded Agents. */
export class TimelineImageStore {
  private pending = new Map<string, PendingImage>();
  private queue: PendingImage[] = [];
  private cache = new Map<string, CachedImage>();
  private active = 0;
  private cachedBytes = 0;

  constructor(
    private loader: ThumbnailLoader = loadTimelineThumbnail,
    private concurrency = 6,
    private cacheBytes = 32 * 1024 * 1024,
  ) {}

  load(
    src: string,
    height: number,
    signal: AbortSignal,
  ): Promise<TimelineThumbnail> {
    signal.throwIfAborted();
    const key = `${Math.round(height)}\u0000${src}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.thumbnail
        ? Promise.resolve(cached.thumbnail)
        : Promise.reject(cached.error);
    }
    let entry = this.pending.get(key);
    if (!entry) {
      entry = {
        key,
        src,
        height,
        controller: new AbortController(),
        subscribers: new Set(),
      };
      this.pending.set(key, entry);
      this.queue.push(entry);
    }
    const pending = entry;
    const result = new Promise<TimelineThumbnail>((resolve, reject) => {
      const onAbort = () => {
        pending.subscribers.delete(subscriber);
        subscriber.cleanup();
        reject(signal.reason);
        if (!pending.subscribers.size && this.pending.get(key) === pending) {
          this.pending.delete(key);
          const index = this.queue.indexOf(pending);
          if (index >= 0) this.queue.splice(index, 1);
          pending.controller.abort();
        }
      };
      const subscriber = {
        resolve,
        reject,
        cleanup: () => signal.removeEventListener('abort', onAbort),
      };
      pending.subscribers.add(subscriber);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    this.pump();
    return result;
  }

  private remember(key: string, value: CachedImage) {
    this.cache.set(key, value);
    this.cachedBytes += value.bytes;
    while (this.cachedBytes > this.cacheBytes || this.cache.size > 512) {
      const oldest = this.cache.entries().next().value;
      if (!oldest) break;
      this.cache.delete(oldest[0]);
      this.cachedBytes -= oldest[1].bytes;
    }
  }

  private finish(
    entry: PendingImage,
    thumbnail?: TimelineThumbnail,
    error?: unknown,
  ) {
    if (this.pending.get(entry.key) !== entry) return;
    this.pending.delete(entry.key);
    this.remember(entry.key, {
      thumbnail,
      error,
      bytes:
        (thumbnail ? thumbnail.width * thumbnail.height * 4 : 0) +
        entry.key.length * 2,
    });
    for (const subscriber of entry.subscribers) {
      subscriber.cleanup();
      if (thumbnail) subscriber.resolve(thumbnail);
      else subscriber.reject(error);
    }
    entry.subscribers.clear();
  }

  private pump() {
    while (this.active < this.concurrency && this.queue.length) {
      const entry = this.queue.shift()!;
      this.active++;
      Promise.resolve()
        .then(() =>
          this.loader(entry.src, entry.height, entry.controller.signal),
        )
        .then(
          (thumbnail) => this.finish(entry, thumbnail),
          (error) => this.finish(entry, undefined, error),
        )
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }
}

export const timelineImageStore = new TimelineImageStore();
