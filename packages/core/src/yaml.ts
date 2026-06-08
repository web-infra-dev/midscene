import type { TMultimodalPrompt, TUserPrompt } from './common';
import type {
  AndroidConnectionOpt,
  ComputerConnectionOpt,
  HarmonyConnectionOpt,
  IOSConnectionOpt,
  WebConnectionOpt,
} from './connection-options';
import type { AgentOpt, LocateResultElement, Rect } from './types';
import type { UIContext } from './types';

export interface LocateOption extends Partial<TMultimodalPrompt> {
  prompt?: TUserPrompt;
  deepLocate?: boolean; // only available in vl model
  /** @deprecated Use `deepLocate` instead. Kept for backward compatibility. */
  deepThink?: boolean; // alias for deepLocate
  cacheable?: boolean; // user can set this param to false to disable the cache for a single agent api
  xpath?: string; // only available in web
  uiContext?: UIContext;
  fileChooserAccept?: string | string[]; // file path(s) to upload when tapping triggers a file chooser
}

export interface ServiceExtractOption {
  domIncluded?: boolean | 'visible-only';
  screenshotIncluded?: boolean;
  [key: string]: unknown;
}

export interface DetailedLocateParam
  extends Omit<LocateOption, 'deepThink' | keyof TMultimodalPrompt> {
  prompt: TUserPrompt;
}

export type ScrollType =
  | 'singleAction'
  | 'scrollToBottom'
  | 'scrollToTop'
  | 'scrollToRight'
  | 'scrollToLeft'
  // Legacy aliases kept for backward compatibility
  | 'once'
  | 'untilBottom'
  | 'untilTop'
  | 'untilRight'
  | 'untilLeft';

export type ActionScrollParam = {
  direction?: 'down' | 'up' | 'right' | 'left';
  scrollType?: ScrollType;
  distance?: number | null;
  locate?: LocateResultElement;
};

export type ScrollParam = Omit<ActionScrollParam, 'locate'>;

export interface MidsceneYamlScript {
  // @deprecated
  target?: MidsceneYamlScriptWebEnv;

  web?: MidsceneYamlScriptWebEnv;
  android?: MidsceneYamlScriptAndroidEnv;
  ios?: MidsceneYamlScriptIOSEnv;
  harmony?: MidsceneYamlScriptHarmonyEnv;
  computer?: MidsceneYamlScriptComputerEnv;

  interface?: MidsceneYamlScriptEnvGeneralInterface;
  config?: MidsceneYamlScriptConfig;
  agent?: MidsceneYamlScriptAgentOpt;

  tasks: MidsceneYamlTask[];
}

export interface MidsceneYamlTask {
  name: string;
  flow: MidsceneYamlFlowItem[];
  continueOnError?: boolean;
}

/**
 * Agent configuration options that can be specified in YAML scripts.
 *
 * This type includes serializable fields from AgentOpt, excluding non-serializable
 * fields like functions and complex objects. All fields are optional.
 *
 * @remarks
 * - testId is deprecated; prefer reportFileName and cache.id
 * - These settings apply to all platforms (Web, Android, iOS, Generic Interface)
 * - modelConfig is configured through environment variables, not in YAML
 *
 * @example
 * ```yaml
 * agent:
 *   reportFileName: "checkout-report"
 *   groupName: "E2E Test Suite"
 *   generateReport: true
 *   replanningCycleLimit: 30
 *   cache:
 *     id: "checkout-cache"
 *     strategy: "read-write"
 * ```
 */
export type MidsceneYamlScriptAgentOpt = Pick<
  AgentOpt,
  | 'testId' // deprecated, kept for backward compatibility
  | 'groupName'
  | 'groupDescription'
  | 'generateReport'
  | 'persistExecutionDump'
  | 'autoPrintReportMsg'
  | 'reportFileName'
  | 'replanningCycleLimit'
  | 'aiActContext'
  | 'aiActionContext'
  | 'cache'
  | 'screenshotShrinkFactor'
>;

export interface MidsceneYamlScriptConfig {
  output?: string;
  unstableLogContent?: boolean | string;
}

export interface MidsceneYamlScriptEnvGeneralInterface {
  // this will work as `const {...} = import('...'); const interface = new ...(param)`
  module: string;
  export?: string;
  param?: Record<string, any>;
}

// The YAML-script env types are the connection options plus the YAML run
// config (and, for web, agent behavior). Connection options are the source of
// truth — see `./connection-options`.
export interface MidsceneYamlScriptWebEnv
  extends WebConnectionOpt,
    MidsceneYamlScriptConfig,
    MidsceneYamlScriptAgentOpt {}

export interface MidsceneYamlScriptAndroidEnv
  extends AndroidConnectionOpt,
    MidsceneYamlScriptConfig {}

export interface MidsceneYamlScriptIOSEnv
  extends IOSConnectionOpt,
    MidsceneYamlScriptConfig {}

export interface MidsceneYamlScriptHarmonyEnv
  extends HarmonyConnectionOpt,
    MidsceneYamlScriptConfig {}

export interface MidsceneYamlScriptComputerEnv
  extends ComputerConnectionOpt,
    MidsceneYamlScriptConfig {}

export type MidsceneYamlScriptEnv =
  | MidsceneYamlScriptWebEnv
  | MidsceneYamlScriptAndroidEnv
  | MidsceneYamlScriptIOSEnv
  | MidsceneYamlScriptHarmonyEnv
  | MidsceneYamlScriptComputerEnv;

export interface MidsceneYamlFlowItemAIAction {
  // defined as aiAction for backward compatibility
  aiAction?: TUserPrompt | null;
  ai?: TUserPrompt | null; // this is the shortcut for aiAct
  aiAct?: TUserPrompt | null;
  instruction?: TUserPrompt;
  aiActionProgressTips?: string[];
  cacheable?: boolean;
  [key: string]: unknown;
}

export interface MidsceneYamlFlowItemAIAssert extends ServiceExtractOption {
  aiAssert: string;
  errorMessage?: string;
  name?: string;
}

export interface MidsceneYamlFlowItemAIWaitFor extends ServiceExtractOption {
  aiWaitFor: string;
  timeout?: number;
}

export interface MidsceneYamlFlowItemEvaluateJavaScript {
  javascript: string;
  name?: string;
}

export interface MidsceneYamlFlowItemSleep {
  sleep: number;
}

export interface MidsceneYamlFlowItemLogScreenshot {
  logScreenshot?: string; // optional, the title of the screenshot
  recordToReport?: string; // preferred key for record title
  content?: string;
}

export type MidsceneYamlFlowItem =
  | MidsceneYamlFlowItemAIAction
  | MidsceneYamlFlowItemAIAssert
  | MidsceneYamlFlowItemAIWaitFor
  | MidsceneYamlFlowItemEvaluateJavaScript
  | MidsceneYamlFlowItemSleep
  | MidsceneYamlFlowItemLogScreenshot;

export interface FreeFn {
  name: string;
  fn: () => void;
}

export interface ScriptPlayerTaskStatus extends MidsceneYamlTask {
  status: ScriptPlayerStatusValue;
  currentStep?: number;
  totalSteps: number;
  error?: Error;
}

export type ScriptPlayerStatusValue = 'init' | 'running' | 'done' | 'error';

// Index YAML file types for batch execution
export interface MidsceneYamlConfig {
  concurrent?: number;
  continueOnError?: boolean;
  summary?: string;
  shareBrowserContext?: boolean;
  web?: MidsceneYamlScriptWebEnv;
  android?: MidsceneYamlScriptAndroidEnv;
  ios?: MidsceneYamlScriptIOSEnv;
  files: string[];
  headed?: boolean;
  keepWindow?: boolean;
  dotenvOverride?: boolean;
  dotenvDebug?: boolean;
}

export interface MidsceneYamlConfigOutput {
  format?: 'json';
  path?: string;
}

export interface MidsceneYamlConfigResult {
  file: string;
  success: boolean;
  executed: boolean;
  output?: string | null;
  report?: string | null;
  error?: string;
  duration?: number;
  /**
   * Type of result:
   * - 'success': All tasks completed successfully
   * - 'failed': Execution failed (player error)
   * - 'partialFailed': Some tasks failed but execution continued (continueOnError)
   * - 'notExecuted': Not executed due to previous failures
   */
  resultType?: 'success' | 'failed' | 'partialFailed' | 'notExecuted';
}
