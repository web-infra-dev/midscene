import type { PlanningActionParamScroll, Rect } from './types';

export interface LocateOption {
  prompt?: string;
  deepThink?: boolean; // only available in vl model
  cacheable?: boolean; // user can set this param to false to disable the cache for a single agent api
}

export interface InsightExtractOption {
  domIncluded?: boolean;
  screenshotIncluded?: boolean;
}

export interface ReferenceImage {
  base64: string;
  rect?: Rect;
}

export interface DetailedLocateParam extends LocateOption {
  prompt: string;
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
  tasks: MidsceneYamlTask[];
}

export interface MidsceneYamlTask {
  name: string;
  flow: MidsceneYamlFlowItem[];
  continueOnError?: boolean;
}

export interface MidsceneYamlScriptEnvBase {
  output?: string;
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

export type MidsceneYamlScriptEnv =
  | MidsceneYamlScriptWebEnv
  | MidsceneYamlScriptAndroidEnv;

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

export interface MidsceneYamlFlowItemAINString extends InsightExtractOption {
  aiString: string;
  name?: string;
}

export interface MidsceneYamlFlowItemAIBoolean extends InsightExtractOption {
  aiBoolean: string;
  name?: string;
}

export interface MidsceneYamlFlowItemAILocate {
  aiLocate: string;
  name?: string;
}

export interface MidsceneYamlFlowItemAIWaitFor {
  aiWaitFor: string;
  timeout?: number;
}

export interface MidsceneYamlFlowItemAITap extends LocateOption {
  aiTap: string;
}

export interface MidsceneYamlFlowItemAIRightClick extends LocateOption {
  aiRightClick: string;
}

export interface MidsceneYamlFlowItemAIHover extends LocateOption {
  aiHover: string;
}

export interface MidsceneYamlFlowItemAIInput extends LocateOption {
  aiInput: string; // value to input
  locate: string; // where to input
}

export interface MidsceneYamlFlowItemAIKeyboardPress extends LocateOption {
  aiKeyboardPress: string;
  locate?: string; // where to press, optional
}

export interface MidsceneYamlFlowItemAIScroll
  extends LocateOption,
    PlanningActionParamScroll {
  aiScroll: null;
  locate?: string; // which area to scroll, optional
}

export interface MidsceneYamlFlowItemEvaluateJavaScript {
  javascript: string;
  name?: string;
}

export interface MidsceneYamlFlowItemSleep {
  sleep: number;
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
  | MidsceneYamlFlowItemSleep;

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
