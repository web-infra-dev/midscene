import { ifInBrowser } from '@midscene/shared/utils';
import type { ScreenshotItem } from '../screenshot-item';
import type { StorageProvider } from '../storage';
import { MemoryStorage } from '../storage';
import { getReportTpl, getVersion } from '../utils';
import { ExecutionDump } from './execution-dump';
import {
  generateDumpScriptTag,
  generateImageScriptTag,
  parseDumpScript,
  parseImageScripts,
} from './html-utils';
import type {
  GroupedActionDumpInit,
  SerializableGroupedActionDump,
  SerializeWithImagesResult,
  ToHTMLOptions,
  WriteToDirectoryOptions,
} from './types';

/**
 * GroupedActionDump is the top-level container for execution dumps.
 * Manages serialization, deserialization, and report generation.
 */
export class GroupedActionDump {
  readonly sdkVersion: string;
  readonly groupName: string;
  readonly groupDescription?: string;
  private _modelBriefs: Set<string>;
  private _executions: ExecutionDump[];
  private _storageProvider: StorageProvider;

  constructor(groupName: string, options?: GroupedActionDumpInit) {
    this.sdkVersion = options?.sdkVersion ?? getVersion();
    this.groupName = groupName;
    this.groupDescription = options?.groupDescription;
    this._modelBriefs = new Set();
    this._executions = [];
    this._storageProvider = options?.storageProvider || new MemoryStorage();
  }

  get storageProvider(): StorageProvider {
    return this._storageProvider;
  }

  get executions(): ReadonlyArray<ExecutionDump> {
    return this._executions;
  }

  get modelBriefs(): string[] {
    return Array.from(this._modelBriefs);
  }

  addModelBrief(brief: string): void {
    this._modelBriefs.add(brief);
  }

  appendExecution(execution: ExecutionDump): void {
    this._executions.push(execution);
  }

  updateExecution(index: number, execution: ExecutionDump): void {
    if (index >= 0 && index < this._executions.length) {
      this._executions[index] = execution;
    }
  }

  collectAllScreenshots(): ScreenshotItem[] {
    return this._executions.flatMap((exec) => exec.collectScreenshots());
  }

  /** Serialize to JSON string (screenshots as { $screenshot: id }) */
  serialize(): string {
    const data: SerializableGroupedActionDump = {
      sdkVersion: this.sdkVersion,
      groupName: this.groupName,
      groupDescription: this.groupDescription,
      modelBriefs: this.modelBriefs,
      executions: this._executions.map((e) => e.toSerializable()),
    };
    return JSON.stringify(data);
  }

  /** Collect all screenshot data as a Map */
  private async collectImageData(): Promise<Map<string, string>> {
    const screenshots = this.collectAllScreenshots();
    const images = new Map<string, string>();

    for (const screenshot of screenshots) {
      images.set(screenshot.id, await screenshot.getData());
    }

    return images;
  }

  /** Serialize and extract all image data as a map */
  async serializeWithImages(): Promise<SerializeWithImagesResult> {
    const images = await this.collectImageData();
    return { json: this.serialize(), images };
  }

  /** Get imageMap asynchronously (for Playground compatibility) */
  async getImageMap(): Promise<Record<string, string>> {
    const images = await this.collectImageData();
    return Object.fromEntries(images);
  }

  /** Generate HTML content with embedded images as script tags */
  async toHTML(options?: ToHTMLOptions): Promise<string> {
    const { json, images } = await this.serializeWithImages();

    const imageTags = Array.from(images.entries())
      .map(([id, data]) => generateImageScriptTag(id, data))
      .join('\n');

    const dumpTag = generateDumpScriptTag(json, options?.attributes);

    return imageTags ? `${imageTags}\n${dumpTag}` : dumpTag;
  }

  /** Write report to directory with screenshots as PNG files */
  async writeToDirectory(
    outputDir: string,
    options?: WriteToDirectoryOptions,
  ): Promise<string> {
    // Skip file operations in browser environment
    if (ifInBrowser) {
      console.warn(
        'writeToDirectory is not supported in browser environment, skipping',
      );
      return '';
    }

    // Dynamic import for Node.js modules to avoid bundling issues
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const path = await import('node:path');

    const screenshotsDir = path.join(outputDir, 'screenshots');

    mkdirSync(outputDir, { recursive: true });
    mkdirSync(screenshotsDir, { recursive: true });

    const screenshots = this.collectAllScreenshots();
    const pathMap = new Map<string, string>();

    let counter = 0;
    for (const screenshot of screenshots) {
      const data = await screenshot.getData();
      const fileName = `screenshot_${counter++}.png`;
      const filePath = path.join(screenshotsDir, fileName);

      const base64Data = data.includes(',') ? data.split(',')[1] : data;
      writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

      pathMap.set(screenshot.id, `./screenshots/${fileName}`);
    }

    const serializable = JSON.parse(this.serialize());
    this.replaceIdsWithPaths(serializable, pathMap);

    const indexPath = path.join(outputDir, 'index.html');
    const dumpTag = generateDumpScriptTag(
      JSON.stringify(serializable),
      options?.attributes,
    );

    // Use the full report template with visualizer frontend
    const tpl = getReportTpl();
    const hasValidTemplate = tpl?.includes('</html>');

    let html: string;
    if (hasValidTemplate) {
      // Insert dump script tag before the LAST </html> only
      // Using replace() would replace ALL occurrences including those in JS code
      const lastHtmlTagIndex = tpl.lastIndexOf('</html>');
      html = `${tpl.slice(0, lastHtmlTagIndex)}${dumpTag}\n${tpl.slice(lastHtmlTagIndex)}`;
    } else {
      // Fallback to minimal HTML if template is not available (e.g., in tests)
      html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Midscene Report - ${this.groupName}</title>
</head>
<body>
${dumpTag}
</body>
</html>`;
    }

    writeFileSync(indexPath, html);

    return indexPath;
  }

  private replaceIdsWithPaths(
    obj: unknown,
    pathMap: Map<string, string>,
  ): void {
    if (typeof obj !== 'object' || obj === null) return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.replaceIdsWithPaths(item, pathMap);
      }
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (
        value &&
        typeof value === 'object' &&
        '$screenshot' in value &&
        typeof (value as { $screenshot: unknown }).$screenshot === 'string'
      ) {
        const id = (value as { $screenshot: string }).$screenshot;
        const filePath = pathMap.get(id);
        if (filePath) {
          (obj as Record<string, unknown>)[key] = { $screenshot: filePath };
        }
      } else {
        this.replaceIdsWithPaths(value, pathMap);
      }
    }
  }

  static fromJSON(json: string): GroupedActionDump {
    const data = JSON.parse(json) as SerializableGroupedActionDump;
    const dump = new GroupedActionDump(data.groupName, {
      groupDescription: data.groupDescription,
      sdkVersion: data.sdkVersion,
    });

    for (const brief of data.modelBriefs ?? []) {
      dump.addModelBrief(brief);
    }

    for (const execData of data.executions ?? []) {
      dump.appendExecution(ExecutionDump.fromSerializable(execData));
    }

    return dump;
  }

  static async fromJSONWithImages(
    json: string,
    imageMap: Record<string, string>,
  ): Promise<GroupedActionDump> {
    const data = JSON.parse(json) as SerializableGroupedActionDump;
    const dump = new GroupedActionDump(data.groupName, {
      groupDescription: data.groupDescription,
      sdkVersion: data.sdkVersion,
    });

    // Store images with their original IDs first
    for (const [id, base64] of Object.entries(imageMap)) {
      await dump.storageProvider.storeWithId(id, base64);
    }

    for (const brief of data.modelBriefs ?? []) {
      dump.addModelBrief(brief);
    }

    // Deserialize executions with ScreenshotItem reconstruction
    for (const execData of data.executions ?? []) {
      dump.appendExecution(
        ExecutionDump.fromSerializableWithProvider(
          execData,
          dump.storageProvider,
        ),
      );
    }

    return dump;
  }

  static async fromHTML(html: string): Promise<GroupedActionDump> {
    const imageMap = parseImageScripts(html);
    const dumpJson = parseDumpScript(html);

    // New format: images in separate script tags
    if (Object.keys(imageMap).length > 0) {
      return GroupedActionDump.fromJSONWithImages(dumpJson, imageMap);
    }

    // Check if this is legacy format (images inline in dump)
    const data = JSON.parse(dumpJson);
    if (GroupedActionDump.hasLegacyInlineImages(data)) {
      return GroupedActionDump.fromJSONLegacy(data);
    }

    return GroupedActionDump.fromJSON(dumpJson);
  }

  /**
   * Check if the dump data contains legacy inline base64 images
   */
  private static hasLegacyInlineImages(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) return false;

    if (Array.isArray(data)) {
      return data.some((item) => GroupedActionDump.hasLegacyInlineImages(item));
    }

    for (const [key, value] of Object.entries(data)) {
      // Legacy format: screenshot field is a direct base64 string
      if (
        (key === 'screenshot' || key === 'screenshotBase64') &&
        typeof value === 'string' &&
        (value.startsWith('data:image/') || value.length > 100)
      ) {
        return true;
      }
      if (GroupedActionDump.hasLegacyInlineImages(value)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Handle legacy format where images are inline base64 strings in the dump
   */
  private static async fromJSONLegacy(
    data: SerializableGroupedActionDump,
  ): Promise<GroupedActionDump> {
    const dump = new GroupedActionDump(data.groupName, {
      groupDescription: data.groupDescription,
      sdkVersion: data.sdkVersion,
    });

    for (const brief of data.modelBriefs ?? []) {
      dump.addModelBrief(brief);
    }

    // Extract inline images and convert to new format
    const imageMap: Record<string, string> = {};
    await GroupedActionDump.extractLegacyImages(
      data,
      imageMap,
      dump.storageProvider,
    );

    for (const execData of data.executions ?? []) {
      dump.appendExecution(
        ExecutionDump.fromSerializableWithProvider(
          execData,
          dump.storageProvider,
        ),
      );
    }

    return dump;
  }

  /**
   * Recursively extract legacy inline base64 images and convert to new format
   */
  private static async extractLegacyImages(
    obj: unknown,
    imageMap: Record<string, string>,
    provider: StorageProvider,
  ): Promise<void> {
    if (typeof obj !== 'object' || obj === null) return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        await GroupedActionDump.extractLegacyImages(item, imageMap, provider);
      }
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (
        (key === 'screenshot' || key === 'screenshotBase64') &&
        typeof value === 'string' &&
        (value.startsWith('data:image/') || value.length > 100)
      ) {
        // Store the base64 data and replace with new format
        const id = await provider.store(value);
        imageMap[id] = value;
        (obj as Record<string, unknown>)[key] = { $screenshot: id };
      } else {
        await GroupedActionDump.extractLegacyImages(value, imageMap, provider);
      }
    }
  }

  async cleanup(): Promise<void> {
    await this._storageProvider.cleanup();
  }

  async migrateTo(newProvider: StorageProvider): Promise<void> {
    const screenshots = this.collectAllScreenshots();
    for (const screenshot of screenshots) {
      await screenshot.migrateTo(newProvider);
    }
    this._storageProvider = newProvider;
  }
}
