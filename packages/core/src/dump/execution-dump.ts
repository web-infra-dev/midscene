import type { ScreenshotItem } from '../screenshot-item';
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
    this.logTime = Date.now();
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

  /** Collect all ScreenshotItem instances from recorder items */
  collectScreenshots(): ScreenshotItem[] {
    const screenshots: ScreenshotItem[] = [];

    for (const task of this._tasks) {
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
    const { recorder, ...taskWithoutRecorder } = task;

    if (!recorder) {
      return taskWithoutRecorder;
    }

    return {
      ...taskWithoutRecorder,
      recorder: recorder.map((record) => this.serializeRecorderItem(record)),
    };
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
    });
  }
}
