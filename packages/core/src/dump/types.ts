import type {
  ExecutionRecorderItem,
  ExecutionTask,
  IExecutionDump,
} from '../types';

export interface SerializedScreenshot {
  $screenshot: string;
}

export interface SerializableRecorderItem
  extends Omit<ExecutionRecorderItem, 'screenshot'> {
  screenshot?: SerializedScreenshot | null;
}

export interface SerializableExecutionTask
  extends Omit<ExecutionTask, 'recorder'> {
  recorder?: SerializableRecorderItem[];
}

export interface SerializableExecutionDump
  extends Omit<IExecutionDump, 'tasks'> {
  logTime: number;
  name: string;
  description?: string;
  tasks: SerializableExecutionTask[];
  aiActContext?: string;
}

export interface SerializableGroupedActionDump {
  sdkVersion: string;
  groupName: string;
  groupDescription?: string;
  modelBriefs: string[];
  executions: SerializableExecutionDump[];
}

export interface ToHTMLOptions {
  attributes?: Record<string, string>;
}

export interface WriteToDirectoryOptions {
  attributes?: Record<string, string>;
}

export interface SerializeWithImagesResult {
  json: string;
  images: Map<string, string>;
}
