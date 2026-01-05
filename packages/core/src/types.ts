/* eslint-disable @typescript-eslint/no-explicit-any */

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
  cached_input: number | undefined;
  time_cost: number | undefined;
  model_name: string | undefined;
  model_description: string | undefined;
  intent: string | undefined;
};

export type { LocateResultElement };

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
  abstract screenshotBase64: string;

  abstract size: Size;

  abstract _isFrozen?: boolean;
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

export interface AgentWaitForOpt {
  checkIntervalMs?: number;
  timeoutMs?: number;
  [key: string]: unknown;
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
  type: string;
  param: ParamType;
}

export interface RawResponsePlanningAIResponse {
  action: PlanningAction;
  more_actions_needed_by_instruction: boolean;
  log: string;
  sleep?: number;
  error?: string;
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
  screenshot?: string;
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
    searchAreaUsage?: AIUsageInfo;
    reasoning_content?: string;
  };

export interface ExecutionDump extends DumpMeta {
  name: string;
  description?: string;
  tasks: ExecutionTask[];
  aiActContext?: string;
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
export interface GroupedActionDump {
  sdkVersion: string;
  groupName: string;
  groupDescription?: string;
  modelBriefs: string[];
  executions: ExecutionDump[];
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
