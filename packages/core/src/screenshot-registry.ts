import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { escapeScriptTag, uuid } from '@midscene/shared/utils';

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
  private screenshots = new Map<string, string>(); // id -> tempFilePath

  constructor(groupId: string) {
    this.groupId = this.sanitizeGroupId(groupId);
    this.tempDir = path.join(os.tmpdir(), 'midscene-screenshots', uuid());
    mkdirSync(this.tempDir, { recursive: true });
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
    const id = `${this.groupId}-img-${this.counter}`;
    const filePath = path.join(this.tempDir, `${id}.b64`);
    writeFileSync(filePath, base64);
    // Increment counter only after successful write to avoid ID gaps on failure
    this.screenshots.set(id, filePath);
    this.counter++;
    return id;
  }

  /**
   * Get a screenshot's base64 data by ID (reads from temp file)
   *
   * @param id - The screenshot ID
   * @returns The base64 data, or undefined if not found
   */
  get(id: string): string | undefined {
    const filePath = this.screenshots.get(id);
    if (filePath && existsSync(filePath)) {
      return readFileSync(filePath, 'utf-8');
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
    for (const [id, filePath] of this.screenshots) {
      if (existsSync(filePath)) {
        const base64 = readFileSync(filePath, 'utf-8');
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
    try {
      if (existsSync(this.tempDir)) {
        rmSync(this.tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn('Failed to cleanup screenshot temp directory:', e);
    }
    this.screenshots.clear();
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
}
