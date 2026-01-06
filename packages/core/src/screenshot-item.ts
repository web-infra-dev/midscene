import type { ScreenshotRegistry } from './screenshot-registry';

/**
 * ScreenshotItem encapsulates screenshot data with automatic serialization/deserialization.
 *
 * Usage:
 * - Creation: ScreenshotItem.fromBase64(base64, registry)
 * - Access: item.base64 (sync getter)
 * - Serialization: JSON.stringify(item) → { "$screenshot": "id" }
 * - Deserialization: ScreenshotItem.fromSerialized(data, imageMap)
 */
export class ScreenshotItem {
  private _id: string;
  private _base64: string | null;
  private _registry: ScreenshotRegistry | null;

  private constructor(
    id: string,
    base64: string | null,
    registry: ScreenshotRegistry | null,
  ) {
    this._id = id;
    this._base64 = base64;
    this._registry = registry;
  }

  /**
   * Create from base64 data (during execution).
   * If registry is provided, base64 is stored in registry and only ID is kept.
   */
  static fromBase64(
    base64: string,
    registry?: ScreenshotRegistry,
  ): ScreenshotItem {
    if (registry) {
      const id = registry.register(base64);
      return new ScreenshotItem(id, null, registry);
    }
    return new ScreenshotItem('', base64, null);
  }

  /**
   * Create from serialized data (when loading report).
   * @param data - Serialized format: { $screenshot: "id" } or { $screenshot: "base64..." }
   * @param imageMap - Map from ID to base64 data
   */
  static fromSerialized(
    data: { $screenshot: string },
    imageMap?: Record<string, string>,
  ): ScreenshotItem {
    const value = data.$screenshot;

    // Check if value is an ID (not starting with data:image)
    if (imageMap && !value.startsWith('data:image')) {
      const base64 = imageMap[value] ?? null;
      return new ScreenshotItem(value, base64, null);
    }

    // Value is base64 data directly
    return new ScreenshotItem('', value, null);
  }

  /**
   * Get base64 data synchronously.
   * Throws if data is not available.
   */
  get base64(): string {
    if (this._base64) return this._base64;

    const registryData = this._registry?.get(this._id);
    if (registryData) return registryData;

    throw new Error(
      `Screenshot data not available for id "${this._id}". Ensure the screenshot was captured before accessing base64 data, and verify that the screenshot registry has not been cleaned up or lost this id.`,
    );
  }

  /**
   * Get the screenshot ID.
   */
  get id(): string {
    return this._id;
  }

  /**
   * Check if base64 data is available.
   */
  get hasBase64(): boolean {
    return Boolean(this._base64 || this._registry?.get(this._id));
  }

  /**
   * Serialize for JSON.stringify().
   * Returns { $screenshot: id } or { $screenshot: base64 } if no ID.
   */
  toJSON(): { $screenshot: string } {
    return { $screenshot: this._id || this._base64 || '' };
  }

  /**
   * Check if a value is a serialized ScreenshotItem.
   */
  static isSerialized(value: unknown): value is { $screenshot: string } {
    return (
      typeof value === 'object' &&
      value !== null &&
      '$screenshot' in value &&
      typeof (value as { $screenshot: unknown }).$screenshot === 'string'
    );
  }
}
