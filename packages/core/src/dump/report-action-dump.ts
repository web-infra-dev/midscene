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
import { ScreenshotStore } from './screenshot-store';

/**
 * Replacer function for JSON serialization that handles Page, Browser objects and ScreenshotItem
 */
function replacerForDumpSerialization(_key: string, value: any): any {
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
    return JSON.stringify(this.toJSON(), replacerForDumpSerialization, indents);
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
   * Uses compact { $screenshot: id } format
   */
  serialize(indents?: number): string {
    return JSON.stringify(this.toJSON(), replacerForDumpSerialization, indents);
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
        const entries = Object.entries(obj).map(([key, value]) => [
          key,
          processValue(value),
        ]);
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

    const loadFromExecutionScreenshotDir = (id: string, mimeType: string) => {
      const ext = mimeType === 'image/jpeg' ? 'jpeg' : 'png';
      const filePath = join(screenshotsDir, `${id}.${ext}`);
      if (!existsSync(filePath)) {
        return '';
      }
      const data = readFileSync(filePath);
      return `data:image/${ext};base64,${data.toString('base64')}`;
    };

    // Restore image references
    const dumpData = JSON.parse(dumpString);
    const store = new ScreenshotStore({
      mode: 'directory',
      reportPath: basePath,
    });
    const processedData = restoreImageReferences(dumpData, (ref) => {
      const executionFileImage = loadFromExecutionScreenshotDir(
        ref.id,
        ref.mimeType,
      );
      if (executionFileImage) {
        return executionFileImage;
      }

      if (ref.storage === 'inline') {
        return '';
      }
      return store.loadBase64(ref);
    });
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
