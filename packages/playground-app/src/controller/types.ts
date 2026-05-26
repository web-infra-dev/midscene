import type {
  PlaygroundRuntimeInfo,
  PlaygroundSDK,
  PlaygroundSessionSetup,
} from '@midscene/playground';
import type { DeviceType, ExecutionUxHint } from '@midscene/visualizer';
import type { FormInstance } from 'antd';
import type { PlaygroundSessionViewState } from '../session-state';

export type PlaygroundFormValue = boolean | null | number | string | undefined;
export type PlaygroundFormValues = Record<string, PlaygroundFormValue>;

export interface PlaygroundControllerState {
  playgroundSDK: PlaygroundSDK;
  form: FormInstance<PlaygroundFormValues>;
  formValues: Record<string, unknown>;
  serverOnline: boolean;
  isUserOperating: boolean;
  deviceType: DeviceType;
  runtimeInfo: PlaygroundRuntimeInfo | null;
  executionUxHints: ExecutionUxHint[];
  sessionViewState: PlaygroundSessionViewState;
  sessionSetup: PlaygroundSessionSetup | null;
  sessionSetupError: string | null;
  sessionLoading: boolean;
  sessionMutating: boolean;
  countdown: number | string | null;
  countdownSeconds: number;
}

export interface PlaygroundControllerActions {
  refreshServerState: () => Promise<void>;
  refreshSessionSetup: (input?: Record<string, unknown>) => Promise<void>;
  createSession: (
    input?: Record<string, unknown>,
    options?: { silent?: boolean },
  ) => Promise<boolean>;
  destroySession: () => Promise<void>;
  finishCountdown: () => void;
}

export interface PlaygroundControllerResult {
  state: PlaygroundControllerState;
  actions: PlaygroundControllerActions;
}
