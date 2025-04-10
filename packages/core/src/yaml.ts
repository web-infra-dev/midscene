import type { PlanningActionParamScroll } from './types';

export interface LocateOption {
  prompt?: string;
  deepThink?: boolean; // only available in vl model
}

export interface DetailedLocateParam extends LocateOption {
  prompt: string;
}

export interface scrollParam {
  direction: 'down' | 'up' | 'right' | 'left';
  scrollType: 'once' | 'untilBottom' | 'untilTop' | 'untilRight' | 'untilLeft';
  distance?: null | number; // distance in px
}

export interface MidsceneYamlScript {
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

export interface MidsceneYamlScriptWebEnv {
  output?: string;
  aiActionContext?: string;

  // for web only
  serve?: string;
  url: string;

  // puppeteer only
  userAgent?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  viewportScale?: number;
  waitForNetworkIdle?: {
    timeout?: number; // ms, 30000 for default, set to 0 to disable
    continueOnNetworkIdleError?: boolean; // should continue if failed to wait for network idle, true for default
  };
  cookie?: string;
  forceSameTabNavigation?: boolean; // if track the newly opened tab, true for default in yaml script

  // bridge mode config
  bridgeMode?: false | 'newTabWithUrl' | 'currentTab';
  closeNewTabsAfterDisconnect?: boolean;
}

export interface MidsceneYamlScriptAndroidEnv {
  output?: string;
  aiActionContext?: string;

  // The Android device ID to connect to, optional, will use the first device if not specified
  deviceId?: string;

  // The URL or app package to launch, required
  launch: string;
}

export type MidsceneYamlScriptEnv =
  | MidsceneYamlScriptWebEnv
  | MidsceneYamlScriptAndroidEnv;

export interface MidsceneYamlFlowItemAIAction {
  ai?: string; // this is the shortcut for aiAction
  aiAction?: string;
  aiActionProgressTips?: string[];
}

export interface MidsceneYamlFlowItemAIAssert {
  aiAssert: string;
}

export interface MidsceneYamlFlowItemAIQuery {
  aiQuery: string;
  name?: string;
}

export interface MidsceneYamlFlowItemAIWaitFor {
  aiWaitFor: string;
  timeout?: number;
}

export interface MidsceneYamlFlowItemAITap extends LocateOption {
  aiTap: string;
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

export interface MidsceneYamlFlowItemSleep {
  sleep: number;
}

export type MidsceneYamlFlowItem =
  | MidsceneYamlFlowItemAIAction
  | MidsceneYamlFlowItemAIAssert
  | MidsceneYamlFlowItemAIQuery
  | MidsceneYamlFlowItemAIWaitFor
  | MidsceneYamlFlowItemAITap
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
