/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ChatCompletionMessageParam } from 'openai/resources';

export interface Point {
  left: number;
  top: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Rect = Point & Size;

enum NodeType {
  CONTAINER = 'CONTAINER Node',
  FORM_ITEM = 'FORM_ITEM Node',
  BUTTON = 'BUTTON Node',
  IMG = 'IMG Node',
  TEXT = 'TEXT Node',
}

export abstract class BaseElement {
  abstract id: string;

  abstract attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };

  abstract content: string;

  abstract rect: Rect;

  abstract center: [number, number];

  abstract locator?: string;
}

// export type EnhancedTextElement<DataScheme extends object = {}> = TextElement & {
//   [K in keyof DataScheme]: DataScheme[K];
// };

/**
 * openai
 *
 */
export enum AIResponseFormat {
  JSON = 'json_object',
  TEXT = 'text',
}

export type AISingleElementResponse =
  | {
      id: string;
      reason: string;
      text: string;
    }
  | {
      position: {
        x: number;
        y: number;
      };
      reason: string;
      text: string;
    };

export interface AIElementIdResponse {
  elements: {
    id: string;
    reason: string;
    text: string;
  }[];
  errors?: string[];
}

export interface AIElementPositionResponse {
  elements: {
    position: {
      x: number;
      y: number;
    };
    reason: string;
    text: string;
  }[];
  errors?: string[];
}

export type AIElementResponse = AIElementIdResponse | AIElementPositionResponse;

export interface AISectionParseResponse<DataShape> {
  data: DataShape;
  sections?: LiteUISection[];
  errors?: string[];
}

export interface AIAssertionResponse {
  pass: boolean;
  thought: string;
}

/**
 * context
 */

export abstract class UIContext<ElementType extends BaseElement = BaseElement> {
  abstract screenshotBase64: string;

  abstract screenshotBase64WithElementMarker?: string;

  abstract content: ElementType[];

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
  generateElement?: (opts: {
    content?: string;
    rect: BaseElement['rect'];
  }) => BaseElement;
}

export interface UISection {
  name: string;
  description: string;
  sectionCharacteristics: string;
  rect: Rect;
  content: BaseElement[];
}

export type EnsureObject<T> = { [K in keyof T]: any };

export interface BasicSectionQuery {
  name?: string;
  description?: string;
}

export type InsightExtractParam = string | Record<string, string>;

export interface InsightTaskInfo {
  durationMs: number;
  formatResponse?: string;
  rawResponse?: string;
}

export interface DumpMeta {
  sdkVersion: string;
  logTime: number;
  model_name: string;
}

export interface ReportDumpWithAttributes {
  dumpString: string;
  attributes?: Record<string, any>;
}

export interface InsightDump extends DumpMeta {
  type: 'locate' | 'extract' | 'assert';
  logId: string;
  context: UIContext;
  userQuery: {
    element?: string;
    dataDemand?: InsightExtractParam;
    sections?: Record<string, string>;
    assertion?: string;
  }; // ?
  quickAnswer?: AISingleElementResponse | null;
  matchedSection: UISection[];
  matchedElement: BaseElement[];
  data: any;
  assertionPass?: boolean;
  assertionThought?: string;
  taskInfo: InsightTaskInfo;
  error?: string;
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

export type InsightAssertionResponse = AIAssertionResponse;

/**
 * agent
 */

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

export interface PlanningAction<ParamType = any> {
  thought?: string;
  type:
    | 'Locate'
    | 'Tap'
    | 'Hover'
    | 'Input'
    | 'KeyboardPress'
    | 'Scroll'
    | 'Error'
    | 'Assert'
    | 'AssertWithoutThrow'
    | 'Sleep';
  param: ParamType;
  quickAnswer?: AISingleElementResponse | null;
}

export interface PlanningAIResponse {
  queryLanguage: string;
  actions: PlanningAction[];
  error?: string;
}

export type PlanningActionParamTap = null;
export type PlanningActionParamHover = null;
export interface PlanningActionParamInputOrKeyPress {
  value: string;
}
export interface PlanningActionParamScroll {
  scrollType:
    | 'scrollUntilTop'
    | 'scrollUntilBottom'
    | 'scrollUpOneScreen'
    | 'scrollDownOneScreen';
}

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

export interface ExecutionRecorderItem {
  type: 'screenshot';
  ts: number;
  screenshot?: string;
  timing?: string;
}

export type ExecutionTaskType = 'Planning' | 'Insight' | 'Action' | 'Assertion';

export interface ExecutorContext {
  task: ExecutionTask;
  element?: BaseElement | null;
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
  quickAnswer?: AISingleElementResponse | null;
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
    };
  };

export interface ExecutionDump extends DumpMeta {
  name: string;
  description?: string;
  tasks: ExecutionTask[];
}

/*
task - insight-locate
*/
export interface ExecutionTaskInsightLocateParam {
  prompt: string;
}

export interface ExecutionTaskInsightLocateOutput {
  element: BaseElement | null;
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
  { userPrompt: string },
  { plans: PlanningAction[] }
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
