import { uuid } from '@midscene/shared/utils';

/**
 * ScreenshotItem encapsulates screenshot data.
 *
 * Serialization format: { $screenshot: "id" }
 */
export class ScreenshotItem {
  private _id: string;
  private _base64: string;

  private constructor(id: string, base64: string) {
    this._id = id;
    this._base64 = base64;
  }

  /** Create a new ScreenshotItem from base64 data */
  static create(base64: string): ScreenshotItem {
    return new ScreenshotItem(uuid(), base64);
  }

  get id(): string {
    return this._id;
  }

  get base64(): string {
    return this._base64;
  }

  /** Serialize to { $screenshot: id } format for JSON */
  toSerializable(): { $screenshot: string } {
    return { $screenshot: this._id };
  }

  /** Check if a value is a serialized ScreenshotItem */
  static isSerialized(value: unknown): value is { $screenshot: string } {
    return (
      typeof value === 'object' &&
      value !== null &&
      '$screenshot' in value &&
      typeof (value as Record<string, unknown>).$screenshot === 'string'
    );
  }
}
