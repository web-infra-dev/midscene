import type { PlanningActionParamScroll } from './types';

export interface DetailedLocateParam {
  prompt: string;
  searchArea?: string;
  deepThink?: boolean; // only available in vl model
}

export type LocateParam = string | DetailedLocateParam;

export interface scrollParam {
  direction: 'down' | 'up' | 'right' | 'left';
  scrollType: 'once' | 'untilBottom' | 'untilTop' | 'untilRight' | 'untilLeft';
  distance?: null | number; // distance in px
}

export interface MidsceneYamlScript {
  target: MidsceneYamlScriptEnv;
  tasks: MidsceneYamlTask[];
}

export interface MidsceneYamlTask {
  name: string;
  flow: MidsceneYamlFlowItem[];
  continueOnError?: boolean;
}

export interface MidsceneYamlScriptEnv {
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
  output?: string;
  forceSameTabNavigation?: boolean; // if track the newly opened tab, true for default in yaml script

  // bridge mode config
  bridgeMode?: false | 'newTabWithUrl' | 'currentTab';
  closeNewTabsAfterDisconnect?: boolean;
}

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

export interface MidsceneYamlFlowItemAITap {
  aiTap: LocateParam;
}

export interface MidsceneYamlFlowItemAIHover {
  aiHover: LocateParam;
}

export interface MidsceneYamlFlowItemAIInput {
  aiInput: string;
  locate: LocateParam;
}

export interface MidsceneYamlFlowItemAIKeyboardPress {
  aiKeyboardPress: string;
  locate?: LocateParam;
}

export interface MidsceneYamlFlowItemAIScroll {
  aiScroll: PlanningActionParamScroll;
  locate?: LocateParam;
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
