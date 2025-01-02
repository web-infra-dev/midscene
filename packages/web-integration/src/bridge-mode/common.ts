export const DefaultBridgeServerPort = 3766;
export const DefaultLocalEndpoint = `http://127.0.0.1:${DefaultBridgeServerPort}`;
export const BridgeCallTimeout = 30000;
export const BridgeCallEvent = 'bridge-call';
export const BridgeCallResponseEvent = 'bridge-call-response';
export const BridgeMessageEvent = 'bridge-message';
export const BridgeConnectedEvent = 'bridge-connected';
export const BridgeRefusedEvent = 'bridge-refused';
export const BridgeErrorCodeNoClientConnected = 'no-client-connected';

export interface BridgeCall {
  method: string;
  args: any[];
  response: any;
  callTime: number;
  responseTime: number;
  callback: (error: Error | undefined, response: any) => void;
  error?: Error;
}

export interface BridgeCallRequest {
  id: string;
  method: string;
  args: any[];
}

export interface BridgeCallResponse {
  id: string;
  response: any;
  error?: any;
}
