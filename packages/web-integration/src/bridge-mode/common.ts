export const DefaultBridgeServerHost = '127.0.0.1';
export const DefaultBridgeServerPort = 3766;
export const DefaultLocalEndpoint = `http://${DefaultBridgeServerHost}:${DefaultBridgeServerPort}`;
export const BridgeCallTimeout = 30000;

/**
 * Get the server host based on configuration options.
 * Priority: explicit host > allowRemoteAccess > default (127.0.0.1)
 */
export function getBridgeServerHost(options?: {
  host?: string;
  allowRemoteAccess?: boolean;
}): string {
  if (options?.host) {
    return options.host;
  }
  if (options?.allowRemoteAccess) {
    return '0.0.0.0';
  }
  return DefaultBridgeServerHost;
}

export enum BridgeEvent {
  Call = 'bridge-call',
  CallResponse = 'bridge-call-response',
  UpdateAgentStatus = 'bridge-update-agent-status',
  Message = 'bridge-message',
  Connected = 'bridge-connected',
  Refused = 'bridge-refused',
  ConnectNewTabWithUrl = 'connectNewTabWithUrl',
  ConnectCurrentTab = 'connectCurrentTab',
  GetBrowserTabList = 'getBrowserTabList',
  SetDestroyOptions = 'setDestroyOptions',
  SetActiveTabId = 'setActiveTabId',
}

export const BridgeSignalKill = 'MIDSCENE_BRIDGE_SIGNAL_KILL';

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
