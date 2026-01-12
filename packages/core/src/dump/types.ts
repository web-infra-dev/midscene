import type {
  ExecutionDump as ExecutionDumpInterface,
  ExecutionRecorderItem,
  ExecutionTask,
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
  extends Omit<ExecutionDumpInterface, 'tasks'> {
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

export interface SerializeWithImagesResult {
  json: string;
  images: Map<string, string>;
}

export interface ExecutionDumpInit {
  name: string;
  description?: string;
  tasks?: ExecutionTask[];
  aiActContext?: string;
  logTime?: number;
}

export interface GroupedActionDumpInit {
  groupDescription?: string;
  storageProvider?: import('../storage').StorageProvider;
  sdkVersion?: string;
}
