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
 *   1. Decodes each base64 payload to a `Blob` exactly once per screenshot id.
 *   2. Returns a `blob:` URL that lives in Chromium's Blob storage rather than
 *      V8 string heap.
 *   3. Holds the URL for the lifetime of the report tab.
 *
 * Why no LRU eviction: the set of unique screenshot ids in a report is bounded
 * by the dump itself; it does not grow over time. Evicting entries while
 * downstream consumers (Player's `cachedImg` closure, Timeline's prebuilt
 * `entries[].img` array, Markdown ZIP's `MarkdownAttachment.base64Data`) still
 * hold the returned URL string would invalidate their copies via
 * `URL.revokeObjectURL` and break image rendering / ZIP export.
 */

export interface BlobUrlCacheOptions {
  /** Injectable for tests. */
  createObjectURL?: (blob: Blob) => string;
  /** Injectable for tests. */
  revokeObjectURL?: (url: string) => void;
}

export class BlobUrlCache {
  private readonly create: (blob: Blob) => string;
  private readonly revoke: (url: string) => void;
  private readonly entries = new Map<string, string>();

  constructor(options: BlobUrlCacheOptions = {}) {
    this.create = options.createObjectURL ?? URL.createObjectURL.bind(URL);
    this.revoke = options.revokeObjectURL ?? URL.revokeObjectURL.bind(URL);
  }

  size(): number {
    return this.entries.size;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): string | null {
    return this.entries.get(id) ?? null;
  }

  /**
   * Convert a `data:image/...;base64,...` URL to a Blob URL and cache it.
   * If the input is not a base64 data URL we return it unchanged and skip the
   * cache — file-based screenshots already live outside JS heap.
   */
  putDataUrl(id: string, dataUrl: string): string {
    const existing = this.entries.get(id);
    if (existing) return existing;

    if (!dataUrl.startsWith('data:')) return dataUrl;
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return dataUrl;
    const header = dataUrl.slice(5, commaIdx);
    if (!header.endsWith(';base64')) return dataUrl;
    const mimeType = header.slice(0, -7);
    const payload = dataUrl.slice(commaIdx + 1);

    const blob = base64ToBlob(payload, mimeType);
    const url = this.create(blob);
    this.entries.set(id, url);
    return url;
  }

  /**
   * Release every cached blob URL. Call only when the cache will no longer be
   * read by anyone (e.g. tab unload). Not called automatically — see the
   * module-level comment for why eviction is unsafe.
   */
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
