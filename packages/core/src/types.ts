/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { NodeType } from '@midscene/shared/constants';
import type { CreateOpenAIClientFn, TModelConfig } from '@midscene/shared/env';
import type {
  BaseElement,
  LocateResultElement,
  Rect,
  Size,
} from '@midscene/shared/types';
import type { z } from 'zod';
import type { TUserPrompt } from './common';
import { restoreImageReferences } from './dump/image-restoration';
import { ScreenshotItem } from './screenshot-item';
import type {
  DetailedLocateParam,
  MidsceneYamlFlowItem,
  ServiceExtractOption,
} from './yaml';

export type {
  ElementTreeNode,
  BaseElement,
  Rect,
  Size,
  Point,
} from '@midscene/shared/types';
export * from './yaml';

export type AIUsageInfo = Record<string, any> & {
  prompt_tokens: number | undefined;
  completion_tokens: number | undefined;
  total_tokens: number | undefined;
  cached_input: number | undefined;
  time_cost: number | undefined;
  model_name: string | undefined;
  model_description: string | undefined;
  intent: string | undefined;
  request_id: string | undefined;
};

export type { LocateResultElement };

export type AISingleElementResponseByPosition = {
  position?: {
    x: number;
    y: number;
  };
  bbox?: [number, number, number, number];
  reason: string;
  text: string;
};

export interface AIElementCoordinatesResponse {
  bbox: [number, number, number, number];
  errors?: string[];
}

export type AIElementResponse = AIElementCoordinatesResponse;

export interface AIDataExtractionResponse<DataDemand> {
  data: DataDemand;
  errors?: string[];
  thought?: string;
}

export interface AISectionLocatorResponse {
  bbox: [number, number, number, number];
  references_bbox?: [number, number, number, number][];
  error?: string;
}

export interface AIAssertionResponse {
  pass: boolean;
  thought: string;
}

export interface AIDescribeElementResponse {
  description: string;
  error?: string;
}

export interface LocatorValidatorOption {
  centerDistanceThreshold?: number;
}

export interface LocateValidatorResult {
  pass: boolean;
  rect: Rect;
  center: [number, number];
  centerDistance?: number;
}

export interface AgentDescribeElementAtPointResult {
  prompt: string;
  deepThink: boolean;
  verifyResult?: LocateValidatorResult;
}

/**
 * context
 */

export abstract class UIContext {
  abstract screenshot: ScreenshotItem;

  abstract shotSize: Size;

  abstract _isFrozen?: boolean;

  /**
   * The ratio for converting shrunk screenshot coordinates to logical coordinates.
   *
   * Example:
   * - Physical screen width: 3000px, dpr=6
   * - Logical width: 500px
   * - User-defined screenshotShrinkFactor: 2
   * - Actual shrunk screenshot width: 3000 / 2 = 1500px
   * - shrunkShotToLogicalRatio: dpr / screenshotShrinkFactor = 6 / 2 = 3
   * - To map back to logical coordinates: 1500 / shrunkShotToLogicalRatio = 500px
   */
  abstract shrunkShotToLogicalRatio: number;
}

export type EnsureObject<T> = { [K in keyof T]: any };

export type ServiceAction = 'locate' | 'extract' | 'assert' | 'describe';

export type ServiceExtractParam = string | Record<string, string>;

export type ElementCacheFeature = Record<string, unknown>;

export interface LocateResult {
  element: LocateResultElement | null;
  rect?: Rect;
}

export type ThinkingLevel = 'off' | 'medium' | 'high';

export type DeepThinkOption = 'unset' | true | false;

export interface ServiceTaskInfo {
  durationMs: number;
  formatResponse?: string;
  rawResponse?: string;
  usage?: AIUsageInfo;
  searchArea?: Rect;
  searchAreaRawResponse?: string;
  searchAreaUsage?: AIUsageInfo;
  reasoning_content?: string;
}

export interface DumpMeta {
  logTime: number;
}

export interface ReportDumpWithAttributes {
  dumpString: string;
  attributes?: Record<string, any>;
}

export interface ServiceDump extends DumpMeta {
  type: 'locate' | 'extract' | 'assert';
  logId: string;
  userQuery: {
    element?: TUserPrompt;
    dataDemand?: ServiceExtractParam;
    assertion?: TUserPrompt;
  };
  matchedElement: LocateResultElement[];
  matchedRect?: Rect;
  deepThink?: boolean;
  data: any;
  assertionPass?: boolean;
  assertionThought?: string;
  taskInfo: ServiceTaskInfo;
  error?: string;
  output?: any;
}

export type PartialServiceDumpFromSDK = Omit<
  ServiceDump,
  'logTime' | 'logId' | 'model_name'
>;

export interface ServiceResultBase {
  dump: ServiceDump;
}

export type LocateResultWithDump = LocateResult & ServiceResultBase;

export interface ServiceExtractResult<T> extends ServiceResultBase {
  data: T;
  thought?: string;
  usage?: AIUsageInfo;
  reasoning_content?: string;
}

export class ServiceError extends Error {
  dump: ServiceDump;

  constructor(message: string, dump: ServiceDump) {
    super(message);
    this.name = 'ServiceError';
    this.dump = dump;
  }
}

// intermediate variables to optimize the return value by AI
export interface LiteUISection {
  name: string;
  description: string;
  sectionCharacteristics: string;
  textIds: string[];
}

export type ElementById = (id: string) => BaseElement | null;

export type ServiceAssertionResponse = AIAssertionResponse & {
  usage?: AIUsageInfo;
};

/**
 * agent
 */

export type OnTaskStartTip = (tip: string) => Promise<void> | void;

export interface AgentWaitForOpt extends ServiceExtractOption {
  checkIntervalMs?: number;
  timeoutMs?: number;
}

export interface AgentAssertOpt {
  keepRawResponse?: boolean;
}

/**
 * planning
 *
 */

export interface PlanningLocateParam extends DetailedLocateParam {
  bbox?: [number, number, number, number];
}

export interface PlanningAction<ParamType = any> {
  thought?: string;
  log?: string; // a brief preamble to the user explaining what you’re about to do
  type: string;
  param: ParamType;
}

export type SubGoalStatus = 'pending' | 'running' | 'finished';

export interface SubGoal {
  index: number;
  status: SubGoalStatus;
  description: string;
  logs?: string[];
}

export interface RawResponsePlanningAIResponse {
  action: PlanningAction;
  thought?: string;
  log: string;
  memory?: string;
  error?: string;
  finalizeMessage?: string;
  finalizeSuccess?: boolean;
  updateSubGoals?: SubGoal[];
  markFinishedIndexes?: number[];
}

export interface PlanningAIResponse
  extends Omit<RawResponsePlanningAIResponse, 'action'> {
  actions?: PlanningAction[];
  usage?: AIUsageInfo;
  rawResponse?: string;
  yamlFlow?: MidsceneYamlFlowItem[];
  yamlString?: string;
  error?: string;
  reasoning_content?: string;
  shouldContinuePlanning: boolean;
  output?: string; // Output message from complete-goal (same as finalizeMessage)
}

export interface PlanningActionParamSleep {
  timeMs: number;
}

export interface PlanningActionParamError {
  thought: string;
}

export type PlanningActionParamWaitFor = AgentWaitForOpt & {};

export interface LongPressParam {
  duration?: number;
}

export interface PullParam {
  direction: 'up' | 'down';
  distance?: number;
  duration?: number;
}
/**
 * misc
 */

export interface Color {
  name: string;
  hex: string;
}

export interface BaseAgentParserOpt {
  selector?: string;
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PuppeteerParserOpt extends BaseAgentParserOpt {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PlaywrightParserOpt extends BaseAgentParserOpt {}

/*
action
*/
export interface ExecutionTaskProgressOptions {
  onTaskStart?: (task: ExecutionTask) => Promise<void> | void;
}

export interface ExecutionRecorderItem {
  type: 'screenshot';
  ts: number;
  screenshot?: ScreenshotItem;
  timing?: string;
}

export type ExecutionTaskType = 'Planning' | 'Insight' | 'Action Space' | 'Log';

export interface ExecutorContext {
  task: ExecutionTask;
  element?: LocateResultElement | null;
  uiContext?: UIContext;
}

export interface ExecutionTaskApply<
  Type extends ExecutionTaskType = any,
  TaskParam = any,
  TaskOutput = any,
  TaskLog = any,
> {
  type: Type;
  subType?: string;
  subTask?: boolean;
  param?: TaskParam;
  thought?: string;
  uiContext?: UIContext;
  executor: (
    param: TaskParam,
    context: ExecutorContext,
  ) => // biome-ignore lint/suspicious/noConfusingVoidType: void is intentionally allowed as some executors may not return a value
    | Promise<ExecutionTaskReturn<TaskOutput, TaskLog> | undefined | void>
    | undefined
    | void;
}

export interface ExecutionTaskHitBy {
  from: string;
  context: Record<string, any>;
}

export interface ExecutionTaskReturn<TaskOutput = unknown, TaskLog = unknown> {
  output?: TaskOutput;
  log?: TaskLog;
  recorder?: ExecutionRecorderItem[];
  hitBy?: ExecutionTaskHitBy;
}

export type ExecutionTask<
  E extends ExecutionTaskApply<any, any, any> = ExecutionTaskApply<
    any,
    any,
    any
  >,
> = E &
  ExecutionTaskReturn<
    E extends ExecutionTaskApply<any, any, infer TaskOutput, any>
      ? TaskOutput
      : unknown,
    E extends ExecutionTaskApply<any, any, any, infer TaskLog>
      ? TaskLog
      : unknown
  > & {
    taskId: string;
    status: 'pending' | 'running' | 'finished' | 'failed' | 'cancelled';
    error?: Error;
    errorMessage?: string;
    errorStack?: string;
    timing?: {
      start: number;
      end?: number;
      cost?: number;
    };
    usage?: AIUsageInfo;
    searchAreaUsage?: AIUsageInfo;
    reasoning_content?: string;
  };

export interface IExecutionDump extends DumpMeta {
  name: string;
  description?: string;
  tasks: ExecutionTask[];
  aiActContext?: string;
}

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
 * Reviver function for JSON deserialization that handles ScreenshotItem formats.
 *
 * BEHAVIOR:
 * - For { $screenshot: "id" } format: Left as-is (plain object)
 *   Consumer must use imageMap to restore base64 data
 * - For { base64: "..." } format: Creates ScreenshotItem from base64 data
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

  // Handle serialized format: { $screenshot: "id" }
  // Leave as plain object — consumer uses imageMap to restore
  if (ScreenshotItem.isSerialized(value)) {
    return value;
  }

  // Handle inline base64 format: { base64: "..." }
  if ('base64' in value && typeof value.base64 === 'string') {
    return value;
  }

  return value;
}

/**
 * ExecutionDump class for serializing and deserializing execution dumps
 */
export class ExecutionDump implements IExecutionDump {
  logTime: number;
  name: string;
  description?: string;
  tasks: ExecutionTask[];
  aiActContext?: string;

  constructor(data: IExecutionDump) {
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

/*
task - service-locate
*/
export type ExecutionTaskInsightLocateParam = PlanningLocateParam;

export interface ExecutionTaskInsightLocateOutput {
  element: LocateResultElement | null;
}

export type ExecutionTaskInsightDump = ServiceDump;

export type ExecutionTaskInsightLocateApply = ExecutionTaskApply<
  'Insight',
  ExecutionTaskInsightLocateParam,
  ExecutionTaskInsightLocateOutput,
  ExecutionTaskInsightDump
>;

export type ExecutionTaskInsightLocate =
  ExecutionTask<ExecutionTaskInsightLocateApply>;

/*
task - service-query
*/
export interface ExecutionTaskInsightQueryParam {
  dataDemand: ServiceExtractParam;
}

export interface ExecutionTaskInsightQueryOutput {
  data: any;
}

export type ExecutionTaskInsightQueryApply = ExecutionTaskApply<
  'Insight',
  ExecutionTaskInsightQueryParam,
  any,
  ExecutionTaskInsightDump
>;

export type ExecutionTaskInsightQuery =
  ExecutionTask<ExecutionTaskInsightQueryApply>;

/*
task - assertion
*/
export interface ExecutionTaskInsightAssertionParam {
  assertion: string;
}

export type ExecutionTaskInsightAssertionApply = ExecutionTaskApply<
  'Insight',
  ExecutionTaskInsightAssertionParam,
  ServiceAssertionResponse,
  ExecutionTaskInsightDump
>;

export type ExecutionTaskInsightAssertion =
  ExecutionTask<ExecutionTaskInsightAssertionApply>;

/*
task - action (i.e. interact) 
*/
export type ExecutionTaskActionApply<ActionParam = any> = ExecutionTaskApply<
  'Action Space',
  ActionParam,
  void,
  void
>;

export type ExecutionTaskAction = ExecutionTask<ExecutionTaskActionApply>;

/*
task - Log
*/

export type ExecutionTaskLogApply<
  LogParam = {
    content: string;
  },
> = ExecutionTaskApply<'Log', LogParam, void, void>;

export type ExecutionTaskLog = ExecutionTask<ExecutionTaskLogApply>;

/*
task - planning
*/

export type ExecutionTaskPlanningApply = ExecutionTaskApply<
  'Planning',
  {
    userInstruction: string;
    aiActContext?: string;
  },
  PlanningAIResponse
>;

export type ExecutionTaskPlanning = ExecutionTask<ExecutionTaskPlanningApply>;

/*
task - planning-locate
*/
export type ExecutionTaskPlanningLocateParam = PlanningLocateParam;

export interface ExecutionTaskPlanningLocateOutput {
  element: LocateResultElement | null;
}

export type ExecutionTaskPlanningDump = ServiceDump;

export type ExecutionTaskPlanningLocateApply = ExecutionTaskApply<
  'Planning',
  ExecutionTaskPlanningLocateParam,
  ExecutionTaskPlanningLocateOutput,
  ExecutionTaskPlanningDump
>;

export type ExecutionTaskPlanningLocate =
  ExecutionTask<ExecutionTaskPlanningLocateApply>;

/*
Grouped dump
*/
export interface IGroupedActionDump {
  sdkVersion: string;
  groupName: string;
  groupDescription?: string;
  modelBriefs: string[];
  executions: IExecutionDump[];
}

/**
 * GroupedActionDump class for serializing and deserializing grouped action dumps
 */
export class GroupedActionDump implements IGroupedActionDump {
  sdkVersion: string;
  groupName: string;
  groupDescription?: string;
  modelBriefs: string[];
  executions: ExecutionDump[];

  constructor(data: IGroupedActionDump) {
    this.sdkVersion = data.sdkVersion;
    this.groupName = data.groupName;
    this.groupDescription = data.groupDescription;
    this.modelBriefs = data.modelBriefs;
    this.executions = data.executions.map((exec) =>
      exec instanceof ExecutionDump ? exec : ExecutionDump.fromJSON(exec),
    );
  }

  /**
   * Serialize the GroupedActionDump to a JSON string
   * Uses compact { $screenshot: id } format
   */
  serialize(indents?: number): string {
    return JSON.stringify(this.toJSON(), replacerForDumpSerialization, indents);
  }

  /**
   * Serialize the GroupedActionDump with inline screenshots to a JSON string.
   * Each ScreenshotItem is replaced with { base64: "..." }.
   */
  serializeWithInlineScreenshots(indents?: number): string {
    const processValue = (obj: unknown): unknown => {
      if (obj instanceof ScreenshotItem) {
        return { base64: obj.base64 };
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
  toJSON(): IGroupedActionDump {
    return {
      sdkVersion: this.sdkVersion,
      groupName: this.groupName,
      groupDescription: this.groupDescription,
      modelBriefs: this.modelBriefs,
      executions: this.executions.map((exec) => exec.toJSON()),
    };
  }

  /**
   * Create a GroupedActionDump instance from a serialized JSON string
   */
  static fromSerializedString(serialized: string): GroupedActionDump {
    const parsed = JSON.parse(
      serialized,
      reviverForDumpDeserialization,
    ) as IGroupedActionDump;
    return new GroupedActionDump(parsed);
  }

  /**
   * Create a GroupedActionDump instance from a plain object
   */
  static fromJSON(data: IGroupedActionDump): GroupedActionDump {
    return new GroupedActionDump(data);
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
   * - {basePath}.screenshots.json - ID to path mapping
   *
   * @param basePath - Base path for the dump file
   */
  serializeToFiles(basePath: string): void {
    const screenshotsDir = `${basePath}.screenshots`;
    if (!existsSync(screenshotsDir)) {
      mkdirSync(screenshotsDir, { recursive: true });
    }

    // Write screenshots to separate files
    const screenshotMap: Record<string, string> = {};
    const screenshots = this.collectAllScreenshots();

    for (const screenshot of screenshots) {
      if (screenshot.hasBase64()) {
        const imagePath = join(screenshotsDir, `${screenshot.id}.png`);
        const rawBase64 = screenshot.rawBase64;
        writeFileSync(imagePath, Buffer.from(rawBase64, 'base64'));
        screenshotMap[screenshot.id] = imagePath;
      }
    }

    // Write screenshot map file
    writeFileSync(
      `${basePath}.screenshots.json`,
      JSON.stringify(screenshotMap),
      'utf-8',
    );

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
    const screenshotsMapPath = `${basePath}.screenshots.json`;

    if (!existsSync(screenshotsMapPath)) {
      return dumpString;
    }

    // Read screenshot map and build imageMap from files
    const screenshotMap: Record<string, string> = JSON.parse(
      readFileSync(screenshotsMapPath, 'utf-8'),
    );

    const imageMap: Record<string, string> = {};
    for (const [id, filePath] of Object.entries(screenshotMap)) {
      if (existsSync(filePath)) {
        const data = readFileSync(filePath);
        imageMap[id] = `data:image/png;base64,${data.toString('base64')}`;
      }
    }

    // Restore image references
    const dumpData = JSON.parse(dumpString);
    const processedData = restoreImageReferences(dumpData, imageMap);
    return JSON.stringify(processedData);
  }

  /**
   * Clean up all files associated with a serialized dump.
   *
   * @param basePath - Base path for the dump file
   */
  static cleanupFiles(basePath: string): void {
    const filesToClean = [
      basePath,
      `${basePath}.screenshots.json`,
      `${basePath}.screenshots`,
    ];

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
    return [
      basePath,
      `${basePath}.screenshots.json`,
      `${basePath}.screenshots`,
    ];
  }
}

export type InterfaceType =
  | 'puppeteer'
  | 'playwright'
  | 'static'
  | 'chrome-extension-proxy'
  | 'android'
  | string;

export interface StreamingCodeGenerationOptions {
  /** Whether to enable streaming output */
  stream?: boolean;
  /** Callback function to handle streaming chunks */
  onChunk?: StreamingCallback;
  /** Callback function to handle streaming completion */
  onComplete?: (finalCode: string) => void;
  /** Callback function to handle streaming errors */
  onError?: (error: Error) => void;
}

export type StreamingCallback = (chunk: CodeGenerationChunk) => void;

export interface CodeGenerationChunk {
  /** The incremental content chunk */
  content: string;
  /** The reasoning content */
  reasoning_content: string;
  /** The accumulated content so far */
  accumulated: string;
  /** Whether this is the final chunk */
  isComplete: boolean;
  /** Token usage information if available */
  usage?: AIUsageInfo;
}

export interface StreamingAIResponse {
  /** The final accumulated content */
  content: string;
  /** Token usage information */
  usage?: AIUsageInfo;
  /** Whether the response was streamed */
  isStreamed: boolean;
}

export interface DeviceAction<TParam = any, TReturn = any> {
  name: string;
  description?: string;
  interfaceAlias?: string;
  paramSchema?: z.ZodType<TParam>;
  call: (param: TParam, context: ExecutorContext) => Promise<TReturn> | TReturn;
  delayAfterRunner?: number;
}

/**
 * Type utilities for extracting types from DeviceAction definitions
 */

/**
 * Extract parameter type from a DeviceAction
 */
export type ActionParam<Action extends DeviceAction<any, any>> =
  Action extends DeviceAction<infer P, any> ? P : never;

/**
 * Extract return type from a DeviceAction
 */
export type ActionReturn<Action extends DeviceAction<any, any>> =
  Action extends DeviceAction<any, infer R> ? R : never;

/**
 * Web-specific types
 */
export interface WebElementInfo extends BaseElement {
  id: string;
  attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };
}

export type WebUIContext = UIContext;

/**
 * Agent
 */

export type CacheConfig = {
  strategy?: 'read-only' | 'read-write' | 'write-only';
  id: string;
};

export type Cache =
  | false // No read, no write
  | true // Will throw error at runtime - deprecated
  | CacheConfig; // Object configuration (requires explicit id)

export interface AgentOpt {
  testId?: string;
  // @deprecated
  cacheId?: string; // Keep backward compatibility, but marked as deprecated
  groupName?: string;
  groupDescription?: string;
  /* if auto generate report, default true */
  generateReport?: boolean;
  /* if auto print report msg, default true */
  autoPrintReportMsg?: boolean;

  /**
   * Use directory-based report format with separate image files.
   *
   * When enabled:
   * - Screenshots are saved as PNG files in a `screenshots/` subdirectory
   * - Report is generated as `index.html` with relative image paths
   * - Reduces memory usage and report file size
   *
   * IMPORTANT: 'html-and-external-assets' reports must be served via HTTP server
   * (e.g., `npx serve ./report-dir`). The file:// protocol will not
   * work due to browser CORS restrictions.
   *
   * @default 'single-html'
   */
  outputFormat?: 'single-html' | 'html-and-external-assets';

  onTaskStartTip?: OnTaskStartTip;
  aiActContext?: string;
  aiActionContext?: string;
  /* custom report file name */
  reportFileName?: string;
  modelConfig?: TModelConfig;
  cache?: Cache;
  /**
   * Maximum number of replanning cycles for aiAct.
   * Defaults to 20 (40 for `vlm-ui-tars`) when not provided.
   * If omitted, the agent will also read `MIDSCENE_REPLANNING_CYCLE_LIMIT` for backward compatibility.
   */
  replanningCycleLimit?: number;

  /**
   * Wait time in milliseconds after each action execution.
   * This allows the UI to settle and stabilize before the next action.
   * Defaults to 300ms when not provided.
   */
  waitAfterAction?: number;

  /**
   * When set to true, Midscene will use the target device's time (Android/iOS)
   * instead of the system time. Useful when the device time differs from the
   * host machine. Default: false
   */
  useDeviceTimestamp?: boolean;

  /**
   * Custom screenshot shrink factor to reduce AI token usage.
   * When set, the screenshot will be scaled down by this factor from the physical resolution.
   *
   * Example:
   * - Physical screen width: 3000px, dpr=6
   * - Logical width: 500px
   * - screenshotShrinkFactor: 2
   * - Actual shrunk screenshot width: 3000 / 2 = 1500px
   * - AI analyzes the 1500px screenshot
   * - Coordinates are transformed back to logical (500px) before actions execute
   *
   * Benefits:
   * - Reduces token usage for high-resolution screenshots
   * - Maintains accuracy by scaling coordinates appropriately
   *
   * Must be >= 1 (shrinking only, enlarging is not supported).
   *
   * @default 1 (no shrinking, uses original physical screenshot)
   */
  screenshotShrinkFactor?: number;

  /**
   * Custom OpenAI client factory function
   *
   * If provided, this function will be called to create OpenAI client instances
   * for each AI call, allowing you to:
   * - Wrap clients with observability tools (langsmith, langfuse)
   * - Use custom OpenAI-compatible clients
   * - Apply different configurations based on intent
   *
   * @param config - Resolved model configuration
   * @returns OpenAI client instance (original or wrapped)
   *
   * @example
   * ```typescript
   * createOpenAIClient: async (openai, opts) => {
   *   // Wrap with langsmith for planning tasks
   *   if (opts.baseURL?.includes('planning')) {
   *     return wrapOpenAI(openai, { metadata: { task: 'planning' } });
   *   }
   *
   *   return openai;
   * }
   * ```
   */
  createOpenAIClient?: CreateOpenAIClientFn;
}

export type TestStatus =
  | 'passed'
  | 'failed'
  | 'timedOut'
  | 'skipped'
  | 'interrupted';

export interface ReportFileWithAttributes {
  reportFilePath: string;
  reportAttributes: {
    testDuration: number;
    testStatus: TestStatus;
    testTitle: string;
    testId: string;
    testDescription: string;
  };
}
