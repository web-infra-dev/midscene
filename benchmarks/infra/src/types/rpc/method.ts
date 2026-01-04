/**
 * All support rpc methods
 */
export enum RPCMethod {
  NewAgent = 'new-agent',
  RunAIMethod = 'run-ai-method',
  TerminateAgent = 'terminate-agent',
}

/**
 * Common Params for all rpc methods
 */

export type CommonParams<T> = {
  id: string;
} & T;

/**
 * Common Response for all rpc methods
 */

export type RPCResponse4Succeed<T> = {
  code: 1;
  data: T;
};

export type RPCResponse4Failed = {
  code: 0;
  data: {
    reason: string;
  };
};

export type RPCResponse<T> = RPCResponse4Succeed<T> | RPCResponse4Failed;

/**
 * Params for NewAgent method
 */

export type LocalAndroidDevice = {
  type: 'Local';
  deviceId: string;
};

export type RemoteAndroidDevice = {
  type: 'Remote';
  host: string;
  port: number;
};

export type AndroidDevice = LocalAndroidDevice | RemoteAndroidDevice;

export type NewAgentParams4Android = {
  type: 'Android';
  device: AndroidDevice;
};

export type NewAgentParams4IOS = {
  type: 'iOS';
};

export type NewAgentParams4Common<T> = CommonParams<T>;

export type NewAgentParams = NewAgentParams4Common<
  NewAgentParams4Android | NewAgentParams4IOS
>;

/**
 * Params and Response for RunAIMethod method
 */

export type RunAIMethodParams = CommonParams<{
  task: string;
}>;

export type RunAIMethodResponse = RPCResponse<{
  report: string;
}>;

/**
 * Params and Response for TerminateAgent method
 */

export type TerminateAgentParams = CommonParams<{
  userTaskStatus?: 'Successful' | 'Failed';
}>;

export type TerminateAgentResponse = RPCResponse<string>;
