export interface MidsceneYamlScriptEnv {
  url: string;
  userAgent?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  viewportScale?: number;
  serve?: string;
  waitForNetworkIdle?: {
    timeout?: number; // ms, 30000 for default, set to 0 to disable
    continueOnNetworkIdleError?: boolean; // should continue if failed to wait for network idle, true for default
  };
  cookie?: string;
  output?: string;
}

export interface MidsceneYamlFlowItemAIAction {
  ai?: string; // this is the shortcut for aiAction
  aiAction?: string;
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

export interface MidsceneYamlFlowItemSleep {
  sleep: number;
}

export type MidsceneYamlFlowItem =
  | MidsceneYamlFlowItemAIAction
  | MidsceneYamlFlowItemAIAssert
  | MidsceneYamlFlowItemAIQuery
  | MidsceneYamlFlowItemAIWaitFor
  | MidsceneYamlFlowItemSleep;

export interface MidsceneYamlScript {
  target: MidsceneYamlScriptEnv;
  flow: MidsceneYamlFlowItem[];
}

export type ScriptPlayerStatus = 'init' | 'running' | 'done' | 'error';

export interface ScriptPlayerOptions {
  onStatusChange?: (status: ScriptPlayerStatus) => void;
  onStepChange?: (step: number, totalSteps: number) => void;
  headed?: boolean;
  keepWindow?: boolean;
  testId?: string;
}
