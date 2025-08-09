import type { PlanningActionParamScroll, Rect, TUserPrompt } from './types';
import type { BaseElement, UIContext } from './types';

export interface LocateOption {
  deepThink?: boolean; // only available in vl model
  cacheable?: boolean; // user can set this param to false to disable the cache for a single agent api
  xpath?: string; // only available in web
  pageContext?: UIContext<BaseElement>;
}

export interface InsightExtractOption {
  domIncluded?: boolean | 'visible-only';
  screenshotIncluded?: boolean;
  returnThought?: boolean;
}

export interface ReferenceImage {
  base64: string;
  rect?: Rect;
}

export interface DetailedLocateParam extends LocateOption {
  prompt: TUserPrompt;
  referenceImage?: ReferenceImage;
}

export interface scrollParam {
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
  tasks: MidsceneYamlTask[];
}

export interface MidsceneYamlTask {
  name: string;
  flow: MidsceneYamlFlowItem[];
  continueOnError?: boolean;
}

export interface MidsceneYamlScriptEnvBase {
  output?: string;
  unstableLogContent?: boolean | string;
  aiActionContext?: string;
}

export interface MidsceneYamlScriptWebEnv extends MidsceneYamlScriptEnvBase {
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

export interface MidsceneYamlScriptAndroidEnv
  extends MidsceneYamlScriptEnvBase {
  // The Android device ID to connect to, optional, will use the first device if not specified
  deviceId?: string;

  // The URL or app package to launch, optional, will use the current screen if not specified
  launch?: string;
}

export interface MidsceneYamlScriptIOSEnv extends MidsceneYamlScriptEnvBase {
  // The URL or app to launch, optional, will use the current screen if not specified
  launch?: string;

  // PyAutoGUI server configuration
  serverUrl?: string;
  serverPort?: number;
  autoDismissKeyboard?: boolean;

  // iOS device mirroring configuration to define the mirror position and size
  mirrorConfig?: {
    mirrorX: number;
    mirrorY: number;
    mirrorWidth: number;
    mirrorHeight: number;
  };
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

export interface MidsceneYamlFlowItemAIAssert {
  aiAssert: string;
  errorMessage?: string;
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

export interface MidsceneYamlFlowItemAITap extends LocateOption {
  aiTap: TUserPrompt;
}

export interface MidsceneYamlFlowItemAIRightClick extends LocateOption {
  aiRightClick: TUserPrompt;
}

export interface MidsceneYamlFlowItemAIHover extends LocateOption {
  aiHover: TUserPrompt;
}

export interface MidsceneYamlFlowItemAIInput extends LocateOption {
  aiInput: string; // value to input
  locate: TUserPrompt; // where to input
}

export interface MidsceneYamlFlowItemAIKeyboardPress extends LocateOption {
  aiKeyboardPress: string;
  locate?: TUserPrompt; // where to press, optional
}

export interface MidsceneYamlFlowItemAIScroll
  extends LocateOption,
    PlanningActionParamScroll {
  aiScroll: null;
  locate?: TUserPrompt; // which area to scroll, optional
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
  | MidsceneYamlFlowItemAITap
  | MidsceneYamlFlowItemAIRightClick
  | MidsceneYamlFlowItemAIHover
  | MidsceneYamlFlowItemAIInput
  | MidsceneYamlFlowItemAIKeyboardPress
  | MidsceneYamlFlowItemAIScroll
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
}
