export const DefaultBridgeServerPort = 3766;
export const DefaultLocalEndpoint = `http://127.0.0.1:${DefaultBridgeServerPort}`;
export const BridgeCallTimeout = 30000;

export enum BridgeEvent {
  Call = 'bridge-call',
  CallResponse = 'bridge-call-response',
  UpdateAgentStatus = 'bridge-update-agent-status',
  Message = 'bridge-message',
  Connected = 'bridge-connected',
  Refused = 'bridge-refused',
  ConnectNewTabWithUrl = 'connectNewTabWithUrl',
  ConnectCurrentTab = 'connectCurrentTab',
  SetDestroyOptions = 'setDestroyOptions',
}

export interface BridgeConnectTabOptions {
  /**
   * If true, the page will always track the active tab.
   * @default true
   */
  forceSameTabNavigation?: boolean;
}

export enum MouseEvent {
  PREFIX = 'mouse.',
  Click = 'mouse.click',
  Wheel = 'mouse.wheel',
  Move = 'mouse.move',
  Drag = 'mouse.drag',
}

export enum KeyboardEvent {
  PREFIX = 'keyboard.',
  Type = 'keyboard.type',
  Press = 'keyboard.press',
}

export const BridgePageType = 'page-over-chrome-extension-bridge';

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

export interface BridgeConnectedEventPayload {
  version: string;
}
