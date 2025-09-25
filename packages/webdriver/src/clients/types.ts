import { WEBDRIVER_ELEMENT_ID_KEY } from '@midscene/shared/constants';

export interface WDASession {
  sessionId: string;
  capabilities: Record<string, any>;
}

export interface WDAElement {
  ELEMENT: string;
  [WEBDRIVER_ELEMENT_ID_KEY]: string;
}

export interface WDAElementInfo {
  type: string;
  name: string;
  label: string;
  value: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  enabled: boolean;
  visible: boolean;
}

export interface WebDriverOptions {
  port?: number;
  host?: string;
  timeout?: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface DeviceInfo {
  udid: string;
  name: string;
  model: string;
}
