import { ScreenshotItem } from '../screenshot-item';
import type { StorageProvider } from '../storage';
import type { ExecutionTask } from '../types';
import type {
  ExecutionDumpInit,
  SerializableExecutionDump,
  SerializableExecutionTask,
  SerializableRecorderItem,
  SerializedScreenshot,
} from './types';

// Type guard interfaces for screenshot detection
interface ScreenshotLike {
  toSerializable(): { $screenshot: string };
  getData(): Promise<string>;
}

function hasToSerializable(value: object): value is ScreenshotLike {
  return (
    'toSerializable' in value &&
    'getData' in value &&
    typeof (value as ScreenshotLike).toSerializable === 'function'
  );
}

function isSerializedScreenshot(value: unknown): value is SerializedScreenshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$screenshot' in value &&
    typeof (value as SerializedScreenshot).$screenshot === 'string'
  );
}

/**
 * ExecutionDump represents a single execution session.
 * Contains tasks and their associated screenshots.
 */
export class ExecutionDump {
  readonly logTime: number;
  readonly name: string;
  readonly description?: string;
  readonly aiActContext?: string;
  private _tasks: ExecutionTask[];

  constructor(init: ExecutionDumpInit) {
    this.logTime = init.logTime ?? Date.now();
    this.name = init.name;
    this.description = init.description;
    this.aiActContext = init.aiActContext;
    this._tasks = init.tasks || [];
  }

  get tasks(): ReadonlyArray<ExecutionTask> {
    return this._tasks;
  }

  appendTask(task: ExecutionTask): void {
    this._tasks.push(task);
  }

  /** Collect all ScreenshotItem instances from recorder items and uiContext */
  collectScreenshots(): ScreenshotItem[] {
    const screenshots: ScreenshotItem[] = [];

    for (const task of this._tasks) {
      // Collect uiContext.screenshot if present
      if (
        task.uiContext?.screenshot &&
        typeof task.uiContext.screenshot === 'object' &&
        hasToSerializable(task.uiContext.screenshot as object)
      ) {
        screenshots.push(
          task.uiContext.screenshot as unknown as ScreenshotItem,
        );
      }

      // Collect recorder screenshots
      if (!task.recorder) continue;

      for (const record of task.recorder) {
        const { screenshot } = record;
        if (
          screenshot &&
          typeof screenshot === 'object' &&
          hasToSerializable(screenshot)
        ) {
          screenshots.push(screenshot as unknown as ScreenshotItem);
        }
      }
    }

    return screenshots;
  }

  /** Convert to serializable format (screenshots become { $screenshot: id }) */
  toSerializable(): SerializableExecutionDump {
    return {
      logTime: this.logTime,
      name: this.name,
      description: this.description,
      aiActContext: this.aiActContext,
      tasks: this._tasks.map((task) => this.serializeTask(task)),
    };
  }

  private serializeTask(task: ExecutionTask): SerializableExecutionTask {
    const { recorder, uiContext, ...taskWithoutRecorderAndContext } = task;

    // Serialize uiContext.screenshot if present
    let serializedUiContext: unknown = uiContext;
    if (uiContext?.screenshot) {
      const screenshot = uiContext.screenshot;
      let serializedScreenshot: SerializedScreenshot | null = null;

      if (hasToSerializable(screenshot as object)) {
        serializedScreenshot = (screenshot as ScreenshotLike).toSerializable();
      } else if (isSerializedScreenshot(screenshot)) {
        serializedScreenshot = screenshot;
      }

      // Create a new object with serialized screenshot
      // Using spread to copy all properties and override screenshot
      serializedUiContext = {
        ...uiContext,
        screenshot: serializedScreenshot,
      };
    }

    const result: SerializableExecutionTask = {
      ...taskWithoutRecorderAndContext,
      uiContext: serializedUiContext as SerializableExecutionTask['uiContext'],
    };

    if (recorder) {
      result.recorder = recorder.map((record) =>
        this.serializeRecorderItem(record),
      );
    }

    return result;
  }

  private serializeRecorderItem(
    record: NonNullable<ExecutionTask['recorder']>[number],
  ): SerializableRecorderItem {
    const { screenshot, ...rest } = record;

    if (!screenshot || typeof screenshot !== 'object') {
      return { ...rest, screenshot: null };
    }

    if (hasToSerializable(screenshot)) {
      return { ...rest, screenshot: screenshot.toSerializable() };
    }

    if (isSerializedScreenshot(screenshot)) {
      return { ...rest, screenshot };
    }

    return { ...rest, screenshot: null };
  }

  static fromSerializable(data: SerializableExecutionDump): ExecutionDump {
    return new ExecutionDump({
      name: data.name,
      description: data.description,
      aiActContext: data.aiActContext,
      tasks: data.tasks as ExecutionTask[],
      logTime: data.logTime,
    });
  }

  /**
   * Deserialize with ScreenshotItem reconstruction.
   * Replaces { $screenshot: id } references with actual ScreenshotItem instances.
   */
  static fromSerializableWithProvider(
    data: SerializableExecutionDump,
    provider: StorageProvider,
  ): ExecutionDump {
    const tasks = data.tasks.map((task) =>
      ExecutionDump.rebuildTaskScreenshots(task, provider),
    );

    return new ExecutionDump({
      name: data.name,
      description: data.description,
      aiActContext: data.aiActContext,
      tasks,
      logTime: data.logTime,
    });
  }

  private static rebuildTaskScreenshots(
    task: SerializableExecutionTask,
    provider: StorageProvider,
  ): ExecutionTask {
    // Rebuild uiContext.screenshot if present
    let rebuiltUiContext = task.uiContext;
    if (task.uiContext?.screenshot) {
      const screenshot = task.uiContext.screenshot;
      if (isSerializedScreenshot(screenshot)) {
        rebuiltUiContext = {
          ...task.uiContext,
          screenshot: ScreenshotItem.restore(screenshot.$screenshot, provider),
        };
      }
    }

    // Rebuild recorder screenshots if present
    if (!task.recorder) {
      return { ...task, uiContext: rebuiltUiContext } as ExecutionTask;
    }

    const recorder = task.recorder.map((record) => {
      const { screenshot, ...rest } = record;

      if (!screenshot || typeof screenshot !== 'object') {
        return { ...rest, screenshot: undefined };
      }

      if (isSerializedScreenshot(screenshot)) {
        const restored = ScreenshotItem.restore(
          screenshot.$screenshot,
          provider,
        );
        return { ...rest, screenshot: restored };
      }

      return { ...rest, screenshot: undefined };
    });

    return { ...task, uiContext: rebuiltUiContext, recorder } as ExecutionTask;
  }
}
