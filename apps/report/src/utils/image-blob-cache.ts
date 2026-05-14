/**
 * Move inline base64 screenshots from V8 string heap into Blob storage.
 *
 * Large midscene reports inline every screenshot as a base64 data URL inside
 * `<script type="midscene-image">` tags. When the runtime resolves an image,
 * the resulting `data:image/...` string ends up duplicated in JS heap (cache),
 * `<img src>` attributes, and any downstream consumer. On low-memory machines
 * (e.g. 8 GB Windows) the renderer process hits OOM and Chromium emits
 * `Crashpad_NotConnectedToHandle`.
 *
 * This cache:
 *   1. Decodes each base64 payload to a `Blob` exactly once.
 *   2. Returns a `blob:` URL that lives in Chromium's Blob storage rather than
 *      V8 string heap.
 *   3. Caps the number of live Blob URLs and calls `URL.revokeObjectURL` on
 *      eviction so blobs can be reclaimed.
 */

const DEFAULT_MAX_ENTRIES = 32;

export interface BlobUrlCacheOptions {
  maxEntries?: number;
  /** Injectable for tests. */
  createObjectURL?: (blob: Blob) => string;
  /** Injectable for tests. */
  revokeObjectURL?: (url: string) => void;
}

export class BlobUrlCache {
  private readonly maxEntries: number;
  private readonly create: (blob: Blob) => string;
  private readonly revoke: (url: string) => void;
  private readonly entries = new Map<string, string>();

  constructor(options: BlobUrlCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.create = options.createObjectURL ?? URL.createObjectURL.bind(URL);
    this.revoke = options.revokeObjectURL ?? URL.revokeObjectURL.bind(URL);
  }

  size(): number {
    return this.entries.size;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /**
   * Resolve a cached URL by id, refreshing its LRU position. Returns `null` if
   * the entry was evicted (callers should re-create via {@link put}).
   */
  get(id: string): string | null {
    const url = this.entries.get(id);
    if (!url) return null;
    this.entries.delete(id);
    this.entries.set(id, url);
    return url;
  }

  /**
   * Convert a `data:image/...;base64,...` URL to a Blob URL and cache it.
   * If the input is not a base64 data URL we return it unchanged and skip the
   * cache — file-based screenshots already live outside JS heap.
   */
  putDataUrl(id: string, dataUrl: string): string {
    if (!dataUrl.startsWith('data:')) return dataUrl;
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return dataUrl;
    const header = dataUrl.slice(5, commaIdx);
    if (!header.endsWith(';base64')) return dataUrl;
    const mimeType = header.slice(0, -7);
    const payload = dataUrl.slice(commaIdx + 1);

    const blob = base64ToBlob(payload, mimeType);
    const url = this.create(blob);
    this.put(id, url);
    return url;
  }

  /** Insert a pre-built URL and evict the oldest entries beyond the cap. */
  put(id: string, url: string): void {
    const existing = this.entries.get(id);
    if (existing) {
      this.entries.delete(id);
      if (existing !== url && existing.startsWith('blob:')) {
        this.revoke(existing);
      }
    }
    this.entries.set(id, url);
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      const oldUrl = this.entries.get(oldestKey)!;
      this.entries.delete(oldestKey);
      if (oldUrl.startsWith('blob:')) {
        this.revoke(oldUrl);
      }
    }
  }

  clear(): void {
    for (const url of this.entries.values()) {
      if (url.startsWith('blob:')) this.revoke(url);
    }
    this.entries.clear();
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}
