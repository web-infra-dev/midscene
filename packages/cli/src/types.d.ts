export interface MidsceneYamlScriptEnv {
  url: string;
  userAgent?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  viewportScale?: number;
  serve?: string;
  headed?: boolean;
  waitForNetworkIdle?: {
    timeout?: number; // ms, 30000 for default, set to 0 to disable
    continueOnNetworkIdleError?: boolean; // should continue if failed to wait for network idle, true for default
  };
}

export interface MidsceneYamlFlowItemAIAction {
  ai?: string | { prompt: string }; // this is the shortcut for aiAction
  aiAction?: string | { prompt: string };
}

export interface MidsceneYamlFlowItemAIAssert {
  aiAssert: string | { prompt: string };
}

export interface MidsceneYamlFlowItemAIQuery {
  aiQuery: string | { prompt: string; output?: string };
}

export interface MidsceneYamlFlowItemAIWaitFor {
  aiWaitFor: string | { prompt: string };
}

export interface MidsceneYamlFlowItemSleep {
  sleep: string | { ms: number };
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
