/**
 * All support rpc methods
 */
export enum RPCMethod {
  NewAgent = 'new-agent',
  RunAIMethod = 'run-ai-method',
}

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
export type NewAgentParams4Android = {
  type: 'android';
  deviceId: string;
};

export type NewAgentParams4IOS = {
  type: 'ios';
};

export type NewAgentParams4Common<T> = T & {
  options?: {
    id: string;
  };
};

export type NewAgentParams = NewAgentParams4Common<
  NewAgentParams4Android | NewAgentParams4IOS
>;

/**
 * Params and Response for RunAIMethod method
 */

export type RunAIMethodParams = {
  task: string;
};

export type RunAIMethodResponse = RPCResponse<{
  report: string;
}>;
