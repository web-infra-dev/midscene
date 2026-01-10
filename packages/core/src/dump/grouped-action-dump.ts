import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ScreenshotItemNew } from '../screenshot-item-new';
import type { StorageProvider } from '../storage';
import { MemoryStorage } from '../storage';
import { getVersion } from '../utils';
import { ExecutionDumpNew } from './execution-dump';
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
} from './types';

/**
 * GroupedActionDump is the top-level container for execution dumps.
 * Manages serialization, deserialization, and report generation.
 */
export class GroupedActionDumpNew {
  readonly sdkVersion: string;
  readonly groupName: string;
  readonly groupDescription?: string;
  private _modelBriefs: Set<string>;
  private _executions: ExecutionDumpNew[];
  private _storageProvider: StorageProvider;

  constructor(groupName: string, options?: GroupedActionDumpInit) {
    this.sdkVersion = getVersion();
    this.groupName = groupName;
    this.groupDescription = options?.groupDescription;
    this._modelBriefs = new Set();
    this._executions = [];
    this._storageProvider = options?.storageProvider || new MemoryStorage();
  }

  get storageProvider(): StorageProvider {
    return this._storageProvider;
  }

  get executions(): ReadonlyArray<ExecutionDumpNew> {
    return this._executions;
  }

  get modelBriefs(): string[] {
    return Array.from(this._modelBriefs);
  }

  addModelBrief(brief: string): void {
    this._modelBriefs.add(brief);
  }

  appendExecution(execution: ExecutionDumpNew): void {
    this._executions.push(execution);
  }

  collectAllScreenshots(): ScreenshotItemNew[] {
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

  /** Serialize and extract all image data as a map */
  async serializeWithImages(): Promise<SerializeWithImagesResult> {
    const screenshots = this.collectAllScreenshots();
    const images = new Map<string, string>();

    for (const screenshot of screenshots) {
      images.set(screenshot.id, await screenshot.getData());
    }

    return { json: this.serialize(), images };
  }

  /** Get imageMap asynchronously (for Playground compatibility) */
  async getImageMap(): Promise<Record<string, string>> {
    const screenshots = this.collectAllScreenshots();
    const map: Record<string, string> = {};

    for (const screenshot of screenshots) {
      map[screenshot.id] = await screenshot.getData();
    }

    return map;
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
  async writeToDirectory(outputDir: string): Promise<string> {
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
    const dumpTag = generateDumpScriptTag(JSON.stringify(serializable));

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Midscene Report - ${this.groupName}</title>
</head>
<body>
${dumpTag}
</body>
</html>`;

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

  static fromJSON(json: string): GroupedActionDumpNew {
    const data = JSON.parse(json) as SerializableGroupedActionDump;
    const dump = new GroupedActionDumpNew(data.groupName, {
      groupDescription: data.groupDescription,
    });

    for (const brief of data.modelBriefs ?? []) {
      dump.addModelBrief(brief);
    }

    for (const execData of data.executions ?? []) {
      dump.appendExecution(ExecutionDumpNew.fromSerializable(execData));
    }

    return dump;
  }

  static async fromJSONWithImages(
    json: string,
    imageMap: Record<string, string>,
  ): Promise<GroupedActionDumpNew> {
    const dump = GroupedActionDumpNew.fromJSON(json);

    for (const base64 of Object.values(imageMap)) {
      await dump.storageProvider.store(base64);
    }

    return dump;
  }

  static async fromHTML(html: string): Promise<GroupedActionDumpNew> {
    const imageMap = parseImageScripts(html);
    const dumpJson = parseDumpScript(html);

    if (Object.keys(imageMap).length > 0) {
      return GroupedActionDumpNew.fromJSONWithImages(dumpJson, imageMap);
    }

    return GroupedActionDumpNew.fromJSON(dumpJson);
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
