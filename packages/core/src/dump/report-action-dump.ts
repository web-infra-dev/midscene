import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { ScreenshotItem } from '../screenshot-item';
import type {
  ExecutionTask,
  IExecutionDump,
  IReportActionDump,
} from '../types';
import { restoreImageReferences } from './screenshot-restoration';
import {
  type ImageUrlRef,
  ReportImageStore,
  isBase64ImageDataUrl,
} from './screenshot-store';

/** A multimodal prompt image descriptor retained by an execution dump. */
export interface ReportReferenceImageDescriptor {
  name: string;
  url: string;
}

/** Maps exact prompt image descriptor objects to their persisted assets. */
export type ReferenceImageRefs = ReadonlyMap<
  ReportReferenceImageDescriptor,
  ImageUrlRef
>;

function isReferenceImageDescriptor(
  value: unknown,
): value is ReportReferenceImageDescriptor {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.name === 'string' && typeof record.url === 'string';
}

/**
 * Replacer function for JSON serialization that handles Page, Browser objects and ScreenshotItem
 */
function replacerForDumpSerialization(
  holder: unknown,
  key: string,
  value: any,
  referenceImageRefs?: ReferenceImageRefs,
): any {
  // screenshotSequence is a transient model input (multi-frame capture). Its
  // frames are not persisted by collectScreenshots, so serializing them would
  // emit dangling screenshot refs. The representative `screenshot` is kept.
  if (key === 'screenshotSequence') {
    return undefined;
  }
  if (
    key === 'url' &&
    typeof value === 'string' &&
    isReferenceImageDescriptor(holder) &&
    referenceImageRefs
  ) {
    const referenceImageRef = referenceImageRefs.get(holder);
    if (referenceImageRef) {
      return referenceImageRef;
    }
  }
  if (value && value.constructor?.name === 'Page') {
    return '[Page object]';
  }
  if (value && value.constructor?.name === 'Browser') {
    return '[Browser object]';
  }
  // Handle ScreenshotItem serialization
  if (value && typeof value.toSerializable === 'function') {
    return value.toSerializable();
  }
  return value;
}

function stringifyDump(
  data: IExecutionDump | IReportActionDump,
  indents?: number,
  referenceImageRefs?: ReferenceImageRefs,
): string {
  return JSON.stringify(
    data,
    function (key, value) {
      return replacerForDumpSerialization(this, key, value, referenceImageRefs);
    },
    indents,
  );
}

/**
 * Reviver function for JSON deserialization that keeps screenshot references
 * as plain objects. Resolution is handled lazily by restoreImageReferences.
 *
 * @param key - JSON key being processed
 * @param value - JSON value being processed
 * @returns Restored value
 */
function reviverForDumpDeserialization(key: string, value: any): any {
  // Only process screenshot fields
  if (key !== 'screenshot' || typeof value !== 'object' || value === null) {
    return value;
  }

  if (ScreenshotItem.isSerialized(value)) {
    return value;
  }

  return value;
}

/**
 * ExecutionDump class for serializing and deserializing execution dumps
 */
export class ExecutionDump implements IExecutionDump {
  id?: string;
  logTime: number;
  name: string;
  description?: string;
  tasks: ExecutionTask[];
  aiActContext?: string;

  constructor(data: IExecutionDump) {
    this.id = data.id;
    this.logTime = data.logTime;
    this.name = data.name;
    this.description = data.description;
    this.tasks = data.tasks;
    this.aiActContext = data.aiActContext;
  }

  /**
   * Serialize the ExecutionDump to a JSON string
   */
  serialize(indents?: number): string {
    return stringifyDump(this.toJSON(), indents);
  }

  /**
   * Convert to a plain object for JSON serialization
   */
  toJSON(): IExecutionDump {
    return {
      id: this.id,
      logTime: this.logTime,
      name: this.name,
      description: this.description,
      tasks: this.tasks.map((task) => ({
        ...task,
        recorder: task.recorder || [],
      })),
      aiActContext: this.aiActContext,
    };
  }

  /**
   * Create an ExecutionDump instance from a serialized JSON string
   */
  static fromSerializedString(serialized: string): ExecutionDump {
    const parsed = JSON.parse(
      serialized,
      reviverForDumpDeserialization,
    ) as IExecutionDump;
    return new ExecutionDump(parsed);
  }

  /**
   * Create an ExecutionDump instance from a plain object
   */
  static fromJSON(data: IExecutionDump): ExecutionDump {
    return new ExecutionDump(data);
  }

  /**
   * Collect all ScreenshotItem instances from tasks.
   * Scans through uiContext and recorder items to find screenshots.
   *
   * @returns Array of ScreenshotItem instances
   */
  collectScreenshots(): ScreenshotItem[] {
    const screenshots: ScreenshotItem[] = [];

    for (const task of this.tasks) {
      // Collect uiContext.screenshot if present
      if (task.uiContext?.screenshot instanceof ScreenshotItem) {
        screenshots.push(task.uiContext.screenshot);
      }

      // Collect recorder screenshots
      if (task.recorder) {
        for (const record of task.recorder) {
          if (record.screenshot instanceof ScreenshotItem) {
            screenshots.push(record.screenshot);
          }
        }
      }
    }

    return screenshots;
  }

  /**
   * Collect unique multimodal prompt image descriptors with base64 URLs.
   * Traversal is cycle-safe because task params may contain consumer objects.
   *
   * @returns The unique descriptor objects in first-seen order.
   */
  collectReferenceImages(): ReportReferenceImageDescriptor[] {
    const referenceImages = new Set<ReportReferenceImageDescriptor>();
    const visited = new WeakSet<object>();

    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (typeof value !== 'object' || value === null || visited.has(value)) {
        return;
      }
      visited.add(value);

      const record = value as Record<string, unknown>;
      if (Array.isArray(record.images)) {
        for (const image of record.images) {
          if (!isReferenceImageDescriptor(image)) continue;
          if (isBase64ImageDataUrl(image.url)) referenceImages.add(image);
        }
      }

      for (const nestedValue of Object.values(record)) visit(nestedValue);
    };

    for (const task of this.tasks) visit(task.param);
    return Array.from(referenceImages);
  }
}

/**
 * ReportActionDump class for serializing and deserializing report action dumps
 */
export class ReportActionDump implements IReportActionDump {
  sdkVersion: string;
  groupName: string;
  groupDescription?: string;
  modelBriefs: IReportActionDump['modelBriefs'];
  executions: ExecutionDump[];
  deviceType?: string;

  constructor(data: IReportActionDump) {
    this.sdkVersion = data.sdkVersion;
    this.groupName = data.groupName;
    this.groupDescription = data.groupDescription;
    this.modelBriefs = data.modelBriefs;
    this.executions = data.executions.map((exec) =>
      exec instanceof ExecutionDump ? exec : ExecutionDump.fromJSON(exec),
    );
    this.deviceType = data.deviceType;
  }

  /**
   * Serialize the ReportActionDump to a JSON string
   * Uses typed report references for persisted screenshots.
   */
  serialize(indents?: number): string {
    return stringifyDump(this.toJSON(), indents);
  }

  /**
   * Serialize a report dump while replacing persisted multimodal prompt image
   * URLs with their compact report asset references.
   *
   * @param referenceImageRefs Maps exact prompt descriptors to stored assets.
   * @param indents Optional JSON indentation.
   * @returns The serialized report dump.
   */
  serializeWithReferenceImages(
    referenceImageRefs: ReferenceImageRefs,
    indents?: number,
  ): string {
    return stringifyDump(this.toJSON(), indents, referenceImageRefs);
  }

  /**
   * Serialize the ReportActionDump with inline screenshots to a JSON string.
   * Each ScreenshotItem is replaced with { base64: "...", capturedAt }.
   */
  serializeWithInlineScreenshots(indents?: number): string {
    const processValue = (obj: unknown): unknown => {
      if (obj instanceof ScreenshotItem) {
        return { base64: obj.base64, capturedAt: obj.capturedAt };
      }
      if (Array.isArray(obj)) {
        return obj.map(processValue);
      }
      if (obj && typeof obj === 'object') {
        const entries = Object.entries(obj)
          // screenshotSequence is a transient multi-frame model input whose
          // frames are not persisted; skip it to avoid inlining large base64.
          .filter(([key]) => key !== 'screenshotSequence')
          .map(([key, value]) => [key, processValue(value)]);
        return Object.fromEntries(entries);
      }
      return obj;
    };

    const data = processValue(this.toJSON());
    return JSON.stringify(data, null, indents);
  }

  /**
   * Convert to a plain object for JSON serialization
   */
  toJSON(): IReportActionDump {
    return {
      sdkVersion: this.sdkVersion,
      groupName: this.groupName,
      groupDescription: this.groupDescription,
      modelBriefs: this.modelBriefs,
      executions: this.executions.map((exec) => exec.toJSON()),
      deviceType: this.deviceType,
    };
  }

  /**
   * Create a ReportActionDump instance from a serialized JSON string
   */
  static fromSerializedString(serialized: string): ReportActionDump {
    const parsed = JSON.parse(
      serialized,
      reviverForDumpDeserialization,
    ) as IReportActionDump;
    return new ReportActionDump(parsed);
  }

  /**
   * Create a ReportActionDump instance from a plain object
   */
  static fromJSON(data: IReportActionDump): ReportActionDump {
    return new ReportActionDump(data);
  }

  /**
   * Collect all ScreenshotItem instances from all executions.
   *
   * @returns Array of all ScreenshotItem instances across all executions
   */
  collectAllScreenshots(): ScreenshotItem[] {
    const screenshots: ScreenshotItem[] = [];
    for (const execution of this.executions) {
      screenshots.push(...execution.collectScreenshots());
    }
    return screenshots;
  }

  /**
   * Serialize the dump to files with screenshots as separate PNG files.
   * Creates:
   * - {basePath} - dump JSON with { $screenshot: id } references
   * - {basePath}.screenshots/ - PNG files
   *
   * @param basePath - Base path for the dump file
   */
  serializeToFiles(basePath: string): void {
    const screenshotsDir = `${basePath}.screenshots`;
    if (!existsSync(screenshotsDir)) {
      mkdirSync(screenshotsDir, { recursive: true });
    }

    const screenshots = this.collectAllScreenshots();

    for (const screenshot of screenshots) {
      const imagePath = join(
        screenshotsDir,
        `${screenshot.id}.${screenshot.extension}`,
      );
      if (existsSync(imagePath)) {
        continue;
      }

      const rawBase64 = screenshot.rawBase64;
      writeFileSync(imagePath, Buffer.from(rawBase64, 'base64'));
    }

    // Write dump JSON with references
    writeFileSync(basePath, this.serialize(), 'utf-8');
  }

  /**
   * Read dump from files and return JSON string with inline screenshots.
   * Reads the dump JSON and screenshot files, then inlines the base64 data.
   *
   * @param basePath - Base path for the dump file
   * @returns JSON string with inline screenshots ({ base64: "..." } format)
   */
  static fromFilesAsInlineJson(basePath: string): string {
    const dumpString = readFileSync(basePath, 'utf-8');
    const screenshotsDir = `${basePath}.screenshots`;

    // Restore image references
    const dumpData = JSON.parse(dumpString);
    const imageStore = new ReportImageStore({
      mode: 'directory',
      reportPath: basePath,
      screenshotsDir,
    });
    const resolveImage = (ref: Parameters<typeof imageStore.loadDataUri>[0]) =>
      imageStore.loadDataUri(ref);
    const processedData = restoreImageReferences(
      dumpData,
      resolveImage,
      resolveImage,
    );
    return JSON.stringify(processedData);
  }

  /**
   * Clean up all files associated with a serialized dump.
   *
   * @param basePath - Base path for the dump file
   */
  static cleanupFiles(basePath: string): void {
    const filesToClean = [basePath, `${basePath}.screenshots`];

    for (const filePath of filesToClean) {
      try {
        rmSync(filePath, { force: true, recursive: true });
      } catch {
        // Ignore errors - file may already be deleted
      }
    }
  }

  /**
   * Get all file paths associated with a serialized dump.
   *
   * @param basePath - Base path for the dump file
   * @returns Array of all associated file paths
   */
  static getFilePaths(basePath: string): string[] {
    return [basePath, `${basePath}.screenshots`];
  }
}

// Backward-compatible aliases for existing external consumers.
export type GroupedActionDump = ReportActionDump;
export const GroupedActionDump = ReportActionDump;
