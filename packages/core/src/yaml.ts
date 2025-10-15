import type { TUserPrompt } from './ai-model/common';
import type { AgentOpt, Rect } from './types';
import type { BaseElement, UIContext } from './types';

export interface LocateOption {
  prompt?: TUserPrompt;
  deepThink?: boolean; // only available in vl model
  cacheable?: boolean; // user can set this param to false to disable the cache for a single agent api
  xpath?: string; // only available in web
  uiContext?: UIContext<BaseElement>;
}

export interface InsightExtractOption {
  domIncluded?: boolean | 'visible-only';
  screenshotIncluded?: boolean;
  screenshotListIncluded?: boolean;
  // To make the assert in the "waitfor" section display the warning icon in report
  isWaitForAssert?: boolean;
  doNotThrowError?: boolean;
}

export interface ReferenceImage {
  base64: string;
  rect?: Rect;
}

export interface DetailedLocateParam extends LocateOption {
  prompt: TUserPrompt;
  referenceImage?: ReferenceImage;
}

export interface ScrollParam {
  direction: 'down' | 'up' | 'right' | 'left';
  scrollType: 'once' | 'untilBottom' | 'untilTop' | 'untilRight' | 'untilLeft';
  distance?: null | number; // distance in px
}

export interface MidsceneYamlScript {
  // @deprecated
  target?: MidsceneYamlScriptWebEnv;

  web?: MidsceneYamlScriptWebEnv;
  android?: MidsceneYamlScriptAndroidEnv;
  ios?: MidsceneYamlScriptIOSEnv;

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

export type MidsceneYamlScriptAgentOpt = Pick<
  AgentOpt,
  'aiActionContext' | 'cache'
>;

export interface MidsceneYamlScriptConfig {
  output?: string;
  unstableLogContent?: boolean | string;
  continuousScreenshot?: {
    enabled: boolean;
    intervalMs: number;
    maxCount?: number;
  };
}

export interface MidsceneYamlScriptEnvGeneralInterface {
  // this will work as `const {...} = import('...'); const interface = new ...(param)`
  module: string;
  export?: string;
  param?: Record<string, any>;
}

export interface MidsceneYamlScriptWebEnv
  extends MidsceneYamlScriptConfig,
    MidsceneYamlScriptAgentOpt {
  // for web only
  serve?: string;
  url: string;

  // puppeteer only
  userAgent?: string;
  acceptInsecureCerts?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  viewportScale?: number;
  waitForNetworkIdle?: {
    timeout?: number;
    continueOnNetworkIdleError?: boolean; // should continue if failed to wait for network idle, true for default
  };
  cookie?: string;
  forceSameTabNavigation?: boolean; // if track the newly opened tab, true for default in yaml script

  // bridge mode config
  bridgeMode?: false | 'newTabWithUrl' | 'currentTab';
  closeNewTabsAfterDisconnect?: boolean;
}

export interface MidsceneYamlScriptAndroidEnv extends MidsceneYamlScriptConfig {
  // The Android device ID to connect to, optional, will use the first device if not specified
  deviceId?: string;

  // The URL or app package to launch, optional, will use the current screen if not specified
  launch?: string;
}

export interface MidsceneYamlScriptIOSEnv extends MidsceneYamlScriptConfig {
  // WebDriverAgent configuration
  wdaPort?: number;
  wdaHost?: string;

  // Keyboard behavior configuration
  autoDismissKeyboard?: boolean;

  // The URL or app bundle ID to launch, optional, will use the current screen if not specified
  launch?: string;
}

export type MidsceneYamlScriptEnv =
  | MidsceneYamlScriptWebEnv
  | MidsceneYamlScriptAndroidEnv
  | MidsceneYamlScriptIOSEnv;

export interface MidsceneYamlFlowItemAIAction {
  ai?: string; // this is the shortcut for aiAction
  aiAction?: string;
  aiActionProgressTips?: string[];
  cacheable?: boolean;
}

export interface MidsceneYamlFlowItemAIAssert extends InsightExtractOption {
  aiAssert: string;
  errorMessage?: string;
  name?: string;
}

export interface MidsceneYamlFlowItemAIQuery extends InsightExtractOption {
  aiQuery: string;
  name?: string;
}

export interface MidsceneYamlFlowItemAINumber extends InsightExtractOption {
  aiNumber: string;
  name?: string;
}

export interface MidsceneYamlFlowItemAIString extends InsightExtractOption {
  aiString: string;
  name?: string;
}

export interface MidsceneYamlFlowItemAIAsk extends InsightExtractOption {
  aiAsk: string;
  name?: string;
}

export interface MidsceneYamlFlowItemAIBoolean extends InsightExtractOption {
  aiBoolean: string;
  name?: string;
}

export interface MidsceneYamlFlowItemAILocate extends LocateOption {
  aiLocate: string;
  name?: string;
}

export interface MidsceneYamlFlowItemAIWaitFor {
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
  content?: string;
}

export type MidsceneYamlFlowItem =
  | MidsceneYamlFlowItemAIAction
  | MidsceneYamlFlowItemAIAssert
  | MidsceneYamlFlowItemAIQuery
  | MidsceneYamlFlowItemAIWaitFor
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
