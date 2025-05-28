/* eslint-disable @typescript-eslint/no-explicit-any */

import type { NodeType } from '@midscene/shared/constants';
import type { ChatCompletionMessageParam } from 'openai/resources';
import type {
  DetailedLocateParam,
  MidsceneYamlFlowItem,
  scrollParam,
} from './yaml';
export * from './yaml';

export interface Point {
  left: number;
  top: number;
}

export interface Size {
  width: number; // device independent window size
  height: number;
  dpr?: number; // the scale factor of the screenshots
}

export type Rect = Point & Size & { zoom?: number };

export abstract class BaseElement {
  abstract id: string;

  abstract indexId?: number; // markerId for web

  abstract attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };

  abstract content: string;

  abstract rect: Rect;

  abstract center: [number, number];

  abstract locator?: string;

  abstract xpaths?: string[];
}

export interface ElementTreeNode<
  ElementType extends BaseElement = BaseElement,
> {
  node: ElementType | null;
  children: ElementTreeNode<ElementType>[];
}

export type AIUsageInfo = Record<string, any> & {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
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
  errors?: string[];
}

export interface AIElementCoordinatesResponse {
  bbox: [number, number, number, number];
  errors?: string[];
}

export type AIElementResponse =
  | AIElementLocatorResponse
  | AIElementCoordinatesResponse;

export interface AIDataExtractionResponse<DataShape> {
  data: DataShape;
  errors?: string[];
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

  // @deprecated('use tree instead')
  abstract content: ElementType[];

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

// export interface UISection {
//   name: string;
//   description: string;
//   sectionCharacteristics: string;
//   rect: Rect;
//   content: BaseElement[];
// }

export type EnsureObject<T> = { [K in keyof T]: any };

export type InsightAction = 'locate' | 'extract' | 'assert' | 'describe';

export type InsightExtractParam = string | Record<string, string>;

export type LocateResultElement = {
  id: string;
  indexId?: number;
  center: [number, number];
  rect: Rect;
  xpaths: string[];
  attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };
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
  model_name: string;
  model_description?: string;
}

export interface ReportDumpWithAttributes {
  dumpString: string;
  attributes?: Record<string, any>;
}

export interface InsightDump extends DumpMeta {
  type: 'locate' | 'extract' | 'assert';
  logId: string;
  userQuery: {
    element?: string;
    dataDemand?: InsightExtractParam;
    assertion?: string;
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
  type:
    | 'Locate'
    | 'Tap'
    | 'RightClick'
    | 'Hover'
    | 'Drag'
    | 'Input'
    | 'KeyboardPress'
    | 'Scroll'
    | 'Error'
    | 'ExpectedFalsyCondition'
    | 'Assert'
    | 'AssertWithoutThrow'
    | 'Sleep'
    | 'Finished'
    | 'AndroidBackButton'
    | 'AndroidHomeButton'
    | 'AndroidRecentAppsButton';
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

// export interface PlanningFurtherPlan {
//   whatToDoNext: string;
//   log: string;
// }
// export type PlanningActionParamPlan = PlanningFurtherPlan;

export type PlanningActionParamTap = null;
export type PlanningActionParamHover = null;
export type PlanningActionParamRightClick = null;
export interface PlanningActionParamInputOrKeyPress {
  value: string;
}

export type PlanningActionParamScroll = scrollParam;

export interface PlanningActionParamAssert {
  assertion: string;
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
/**
 * misc
 */

export interface Color {
  name: string;
  hex: string;
}

export interface BaseAgentParserOpt {
  selector?: string;
  ignoreMarker?: boolean;
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

export type ExecutionTaskType = 'Planning' | 'Insight' | 'Action' | 'Assertion';

export interface ExecutorContext {
  task: ExecutionTask;
  element?: LocateResultElement | null;
}

export interface TaskCacheInfo {
  hit: boolean;
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

export interface ExecutionTaskReturn<TaskOutput = unknown, TaskLog = unknown> {
  output?: TaskOutput;
  log?: TaskLog;
  recorder?: ExecutionRecorderItem[];
  cache?: TaskCacheInfo;
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
    error?: string;
    errorStack?: string;
    timing?: {
      start: number;
      end?: number;
      cost?: number;
      aiCost?: number;
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
  executions: ExecutionDump[];
}

export type PageType =
  | 'puppeteer'
  | 'playwright'
  | 'static'
  | 'chrome-extension-proxy'
  | 'android';
