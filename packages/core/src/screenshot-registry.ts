import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { escapeScriptTag, ifInBrowser, uuid } from '@midscene/shared/utils';

/**
 * Script type for storing extracted base64 images in HTML report
 */
export const IMAGE_SCRIPT_TYPE = 'midscene-image';

/**
 * Prefix for image references in dump JSON
 */
export const IMAGE_REF_PREFIX = '#midscene-img:';

/**
 * ScreenshotRegistry manages screenshot storage during test execution.
 *
 * Instead of holding base64 data in memory (which accumulates across tasks),
 * screenshots are immediately written to temporary files. The dump only stores
 * ID references, significantly reducing memory footprint.
 *
 * When generating the report, screenshots are read from temp files and embedded
 * as script tags in the HTML.
 */
export class ScreenshotRegistry {
  private tempDir: string;
  private groupId: string;
  private counter = 0;
  private screenshots = new Map<string, string>(); // id -> tempFilePath or base64 (in browser)

  constructor(groupId: string) {
    this.groupId = this.sanitizeGroupId(groupId);
    if (ifInBrowser) {
      this.tempDir = '';
    } else {
      this.tempDir = path.join(os.tmpdir(), 'midscene-screenshots', uuid());
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Sanitize group ID to ensure safe file names
   */
  private sanitizeGroupId(groupId: string): string {
    return groupId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  }

  /**
   * Register a screenshot: save to temp file and return ID reference
   *
   * @param base64 - The base64 encoded screenshot data
   * @returns The ID reference (e.g., "groupName-img-0")
   */
  register(base64: string): string {
    // If already a reference, extract and return the existing ID
    if (base64.startsWith(IMAGE_REF_PREFIX)) {
      return base64.slice(IMAGE_REF_PREFIX.length);
    }

    const id = `${this.groupId}-img-${this.counter}`;
    try {
      if (ifInBrowser) {
        // In browser, store base64 directly in memory
        this.screenshots.set(id, base64);
      } else {
        const filePath = path.join(this.tempDir, `${id}.b64`);
        writeFileSync(filePath, base64);
        this.screenshots.set(id, filePath);
      }
      // Only increment counter after successful write
      this.counter++;
      return id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to register screenshot ${id}: ${message}`);
    }
  }

  /**
   * Get a screenshot's base64 data by ID (reads from temp file)
   *
   * @param id - The screenshot ID
   * @returns The base64 data, or undefined if not found
   */
  get(id: string): string | undefined {
    const stored = this.screenshots.get(id);
    if (!stored) return undefined;
    if (ifInBrowser) {
      // In browser, stored is base64 directly
      return stored;
    }
    // In Node, stored is file path
    if (existsSync(stored)) {
      return readFileSync(stored, 'utf-8');
    }
    return undefined;
  }

  /**
   * Generate HTML script tags for all registered screenshots.
   * Used when building the report HTML.
   *
   * @returns HTML string containing all image script tags
   */
  generateScriptTags(): string {
    const tags: string[] = [];
    for (const [id, stored] of this.screenshots) {
      let base64: string | undefined;
      if (ifInBrowser) {
        base64 = stored;
      } else if (existsSync(stored)) {
        base64 = readFileSync(stored, 'utf-8');
      }
      if (base64) {
        tags.push(
          // biome-ignore lint/style/useTemplate: consistent with other script tag generation
          '<script type="' +
            IMAGE_SCRIPT_TYPE +
            '" data-id="' +
            id +
            '">\n' +
            escapeScriptTag(base64) +
            '\n</script>',
        );
      }
    }
    return tags.join('\n');
  }

  /**
   * Build the reference string for use in dump JSON
   *
   * @param id - The screenshot ID
   * @returns The reference string (e.g., "#midscene-img:groupName-img-0")
   */
  buildReference(id: string): string {
    return `${IMAGE_REF_PREFIX}${id}`;
  }

  /**
   * Check if a string is an image reference
   */
  static isImageReference(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith(IMAGE_REF_PREFIX);
  }

  /**
   * Extract the ID from an image reference string
   */
  static extractIdFromReference(reference: string): string {
    return reference.slice(IMAGE_REF_PREFIX.length);
  }

  /**
   * Clean up temporary files
   */
  cleanup(): void {
    if (!ifInBrowser) {
      try {
        if (this.tempDir && existsSync(this.tempDir)) {
          rmSync(this.tempDir, { recursive: true, force: true });
        }
      } catch (e) {
        console.warn('Failed to cleanup screenshot temp directory:', e);
      }
    }
    this.screenshots.clear();
  }

  /**
   * Check if a screenshot ID is registered
   */
  has(id: string): boolean {
    return this.screenshots.has(id);
  }

  /**
   * Get the number of registered screenshots
   */
  get size(): number {
    return this.screenshots.size;
  }

  /**
   * Check if any screenshots are registered
   */
  get isEmpty(): boolean {
    return this.screenshots.size === 0;
  }

  /**
   * Get all registered screenshot IDs
   */
  getIds(): string[] {
    return Array.from(this.screenshots.keys());
  }

  /**
   * Get all screenshots as a map of id -> base64 data.
   * Useful for restoring images in contexts without script tags (e.g., Chrome extension).
   *
   * @returns Record mapping screenshot IDs to their base64 data
   */
  getImageMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const id of this.screenshots.keys()) {
      const base64 = this.get(id);
      if (base64) {
        map[id] = base64;
      }
    }
    return map;
  }
}

/**
 * Check if a value is an image reference string.
 */
function isImageReferenceValue(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(IMAGE_REF_PREFIX);
}

/**
 * Restore a screenshot object's value to base64 or file path.
 * Handles multiple formats: base64, file path, legacy reference, or ID.
 *
 * IMPORTANT: This function always processes { $screenshot: "..." } objects,
 * even when imageMap is empty. This is required to convert objects to strings
 * for proper rendering in visualizer components.
 *
 * @param screenshot - The $screenshot property value
 * @param imageMap - Map of image IDs to base64 data
 * @returns The resolved screenshot value (base64, path, or ID)
 */
function restoreScreenshotObject(
  screenshot: unknown,
  imageMap: Record<string, string>,
): string {
  // Handle undefined or null
  if (screenshot === undefined || screenshot === null) {
    return '';
  }

  // Handle non-string values
  if (typeof screenshot !== 'string') {
    console.warn('Invalid $screenshot value type:', typeof screenshot);
    return '';
  }

  // Handle empty string
  if (screenshot.length === 0) {
    return '';
  }

  // Check if it's already base64 data
  if (screenshot.startsWith('data:image/')) {
    return screenshot;
  }

  // Check if it's a file path (for directory-based reports)
  if (screenshot.startsWith('./') || screenshot.startsWith('/')) {
    return screenshot;
  }

  // Extract ID if legacy format, otherwise use screenshot directly
  const lookupId = screenshot.startsWith(IMAGE_REF_PREFIX)
    ? screenshot.slice(IMAGE_REF_PREFIX.length)
    : screenshot;

  // Look up in imageMap
  const base64 = imageMap[lookupId];
  if (base64) {
    return base64;
  }

  // Fallback: warn and return original value
  const availableIds = Object.keys(imageMap);
  if (availableIds.length > 0) {
    console.warn(
      `Image not found for ID: ${screenshot}. Available IDs: ${availableIds.join(', ')}`,
    );
  }
  return screenshot;
}

/**
 * Recursively restore image references in parsed data.
 * Replaces references like "#midscene-img:img-0" with the actual base64 data.
 *
 * @param data - The parsed JSON data with image references
 * @param imageMap - Map of image IDs to base64 data
 * @returns Data with image references restored to base64
 */
export function restoreImageReferences<T>(
  data: T,
  imageMap: Record<string, string>,
): T {
  if (typeof data === 'string') {
    if (isImageReferenceValue(data)) {
      const id = data.slice(IMAGE_REF_PREFIX.length);
      const base64 = imageMap[id];
      if (base64) {
        // Type assertion: string is assignable to T when T extends string
        return base64 as T;
      }
      // Return original reference if not found (for debugging)
      console.warn(`Image not found for reference: ${data}`);
      return data;
    }
    return data;
  }

  if (Array.isArray(data)) {
    // Type assertion: array mapping preserves array type
    return data.map((item) => restoreImageReferences(item, imageMap)) as T;
  }

  if (typeof data === 'object' && data !== null) {
    // Handle { $screenshot: ... } format (new ScreenshotItem serialization)
    if ('$screenshot' in data) {
      const screenshot = (data as { $screenshot: unknown }).$screenshot;
      return restoreScreenshotObject(screenshot, imageMap) as T;
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = restoreImageReferences(value, imageMap);
    }
    // Type assertion: reconstructed object matches original shape
    return result as T;
  }

  return data;
}
