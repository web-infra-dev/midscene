/* eslint-disable @typescript-eslint/no-explicit-any */

import type { NodeType } from '@midscene/shared/constants';
import type {
  BaseElement,
  ElementTreeNode,
  Rect,
  Size,
} from '@midscene/shared/types';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { z } from 'zod';
import type { DetailedLocateParam, MidsceneYamlFlowItem } from './yaml';

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
  time_cost: number | undefined;
  model_name: string | undefined;
};

/**
 * openai
 *
 */
export enum AIResponseFormat {
  JSON = 'json_object',
  TEXT = 'text',
}

export type AISingleElementResponseById = {
  id: string;
  reason?: string;
  text?: string;
  xpaths?: string[];
};

export type AISingleElementResponseByPosition = {
  position?: {
    x: number;
    y: number;
  };
  bbox?: [number, number, number, number];
  reason: string;
  text: string;
};

export type AISingleElementResponse = AISingleElementResponseById;
export interface AIElementLocatorResponse {
  elements: {
    id: string;
    reason?: string;
    text?: string;
    xpaths?: string[];
  }[];
  bbox?: [number, number, number, number];
  isOrderSensitive?: boolean;
  errors?: string[];
}

export interface AIElementCoordinatesResponse {
  bbox: [number, number, number, number];
  isOrderSensitive?: boolean;
  errors?: string[];
}

export type AIElementResponse =
  | AIElementLocatorResponse
  | AIElementCoordinatesResponse;

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

export abstract class UIContext<ElementType extends BaseElement = BaseElement> {
  abstract screenshotBase64: string;

  abstract tree: ElementTreeNode<ElementType>;

  abstract size: Size;
}

/**
 * insight
 */

export type CallAIFn = <T>(
  messages: ChatCompletionMessageParam[],
) => Promise<T>;

export interface InsightOptions {
  taskInfo?: Omit<InsightTaskInfo, 'durationMs'>;
  aiVendorFn?: CallAIFn;
}

export type EnsureObject<T> = { [K in keyof T]: any };

export type InsightAction = 'locate' | 'extract' | 'assert' | 'describe';

export type InsightExtractParam = string | Record<string, string>;

export type LocateResultElement = {
  center: [number, number];
  rect: Rect;
  id: string;
  indexId?: number;
  xpaths: string[];
  attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };
  isOrderSensitive?: boolean;
};

export interface LocateResult {
  element: LocateResultElement | null;
  rect?: Rect;
}

export interface InsightTaskInfo {
  durationMs: number;
  formatResponse?: string;
  rawResponse?: string;
  usage?: AIUsageInfo;
  searchArea?: Rect;
  searchAreaRawResponse?: string;
  searchAreaUsage?: AIUsageInfo;
}

export interface DumpMeta {
  sdkVersion: string;
  logTime: number;
}

export interface ReportDumpWithAttributes {
  dumpString: string;
  attributes?: Record<string, any>;
}

export interface InsightDump extends DumpMeta {
  type: 'locate' | 'extract' | 'assert';
  logId: string;
  userQuery: {
    element?: TUserPrompt;
    dataDemand?: InsightExtractParam;
    assertion?: TUserPrompt;
  };
  matchedElement: BaseElement[];
  matchedRect?: Rect;
  deepThink?: boolean;
  data: any;
  assertionPass?: boolean;
  assertionThought?: string;
  taskInfo: InsightTaskInfo;
  error?: string;
  output?: any;
}

export type PartialInsightDumpFromSDK = Omit<
  InsightDump,
  'sdkVersion' | 'logTime' | 'logId' | 'model_name'
>;

export type DumpSubscriber = (dump: InsightDump) => Promise<void> | void;

// intermediate variables to optimize the return value by AI
export interface LiteUISection {
  name: string;
  description: string;
  sectionCharacteristics: string;
  textIds: string[];
}

export type ElementById = (id: string) => BaseElement | null;

export type InsightAssertionResponse = AIAssertionResponse & {
  usage?: AIUsageInfo;
};

/**
 * agent
 */

export type OnTaskStartTip = (tip: string) => Promise<void> | void;

export interface AgentWaitForOpt {
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
  id?: string;
  bbox?: [number, number, number, number];
}

export interface PlanningAction<ParamType = any> {
  thought?: string;
  type: string;
  param: ParamType;
  locate?: PlanningLocateParam | null;
}

export interface PlanningAIResponse {
  action?: PlanningAction; // this is the qwen mode
  actions?: PlanningAction[];
  more_actions_needed_by_instruction: boolean;
  log: string;
  sleep?: number;
  error?: string;
  usage?: AIUsageInfo;
  rawResponse?: string;
  yamlFlow?: MidsceneYamlFlowItem[];
  yamlString?: string;
}

export type PlanningActionParamTap = null;
export type PlanningActionParamHover = null;
export type PlanningActionParamRightClick = null;

export interface PlanningActionParamInputOrKeyPress {
  value: string;
  autoDismissKeyboard?: boolean;
}

export interface PlanningActionParamAssert {
  assertion: TUserPrompt;
}

export interface PlanningActionParamSleep {
  timeMs: number;
}

export interface PlanningActionParamError {
  thought: string;
}

export type PlanningActionParamWaitFor = AgentWaitForOpt & {
  assertion: string;
};

export interface AndroidLongPressParam {
  duration?: number;
}

export interface AndroidPullParam {
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
  screenshot?: string;
  timing?: string;
}

export type ExecutionTaskType =
  | 'Planning'
  | 'Insight'
  | 'Action'
  | 'Assertion'
  | 'Log';

export interface ExecutorContext {
  task: ExecutionTask;
  element?: LocateResultElement | null;
}

export interface ExecutionTaskApply<
  Type extends ExecutionTaskType = any,
  TaskParam = any,
  TaskOutput = any,
  TaskLog = any,
> {
  type: Type;
  subType?: string;
  param?: TaskParam;
  thought?: string;
  locate?: PlanningLocateParam | null;
  pageContext?: UIContext;
  executor: (
    param: TaskParam,
    context: ExecutorContext,
  ) => // biome-ignore lint/suspicious/noConfusingVoidType: <explanation>
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
  };

export interface ExecutionDump extends DumpMeta {
  name: string;
  description?: string;
  tasks: ExecutionTask[];
}

/*
task - insight-locate
*/
export type ExecutionTaskInsightLocateParam = PlanningLocateParam;

export interface ExecutionTaskInsightLocateOutput {
  element: LocateResultElement | null;
}

export interface ExecutionTaskInsightDumpLog {
  dump?: InsightDump;
}

export type ExecutionTaskInsightLocateApply = ExecutionTaskApply<
  'Insight',
  ExecutionTaskInsightLocateParam,
  ExecutionTaskInsightLocateOutput,
  ExecutionTaskInsightDumpLog
>;

export type ExecutionTaskInsightLocate =
  ExecutionTask<ExecutionTaskInsightLocateApply>;

/*
task - insight-query
*/
export interface ExecutionTaskInsightQueryParam {
  dataDemand: InsightExtractParam;
}

export interface ExecutionTaskInsightQueryOutput {
  data: any;
}

export type ExecutionTaskInsightQueryApply = ExecutionTaskApply<
  'Insight',
  ExecutionTaskInsightQueryParam,
  any,
  ExecutionTaskInsightDumpLog
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
  InsightAssertionResponse,
  ExecutionTaskInsightDumpLog
>;

export type ExecutionTaskInsightAssertion =
  ExecutionTask<ExecutionTaskInsightAssertionApply>;

/*
task - action (i.e. interact) 
*/
export type ExecutionTaskActionApply<ActionParam = any> = ExecutionTaskApply<
  'Action',
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
    log?: string;
  },
  PlanningAIResponse
>;

export type ExecutionTaskPlanning = ExecutionTask<ExecutionTaskPlanningApply>;

/*
Grouped dump
*/
export interface GroupedActionDump {
  groupName: string;
  groupDescription?: string;
  modelName: string;
  modelDescription: string;
  executions: ExecutionDump[];
}

export type PageType =
  | 'puppeteer'
  | 'playwright'
  | 'static'
  | 'chrome-extension-proxy'
  | 'android';

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

export type TMultimodalPrompt = {
  /**
   * Support use image to inspect elements.
   * The "images" field is an object that uses image name as key and image url as value.
   * The image url can be a local path, a http link , or a base64 string.
   */
  images?: {
    name: string;
    url: string;
  }[];
  /**
   * By default, the image url in the "images" filed starts with `https://` or `http://` will be directly sent to the LLM.
   * In case the images are not accessible to the LLM (One common case is that image url is internal network only.), you can enable this option.
   * Then image will be download and convert to base64 format.
   */
  convertHttpImage2Base64?: boolean;
};

export type TUserPrompt =
  | string
  | ({
      prompt: string;
    } & Partial<TMultimodalPrompt>);

// biome-ignore lint/complexity/noBannedTypes: <explanation>
export interface DeviceAction<T = {}> {
  name: string;
  description?: string;
  interfaceAlias?: string;
  paramSchema?: z.ZodType<T>;
  call: (param: T, context: ExecutorContext) => Promise<void> | void;
}
