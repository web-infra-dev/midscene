import type { Size } from '@midscene/core';

export type RDPMouseButton = 'left' | 'right' | 'middle';
export type RDPMouseButtonAction = 'down' | 'up' | 'click' | 'doubleClick';
export type RDPScrollDirection = 'up' | 'down' | 'left' | 'right';
export type RDPSecurityProtocol = 'auto' | 'tls' | 'nla' | 'rdp';

export interface RDPConnectionConfig {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  domain?: string;
  adminSession?: boolean;
  ignoreCertificate?: boolean;
  securityProtocol?: RDPSecurityProtocol;
  desktopWidth?: number;
  desktopHeight?: number;
}

export interface RDPConnectionInfo {
  sessionId: string;
  size: Size;
  server: string;
}

export interface RDPHelperEnvelope<TPayload> {
  id: string;
  payload: TPayload;
}

export type RDPProtocolRequest =
  | {
      type: 'connect';
      config: RDPConnectionConfig;
    }
  | {
      type: 'disconnect';
    }
  | {
      type: 'screenshot';
    }
  | {
      type: 'size';
    }
  | {
      type: 'mouseMove';
      x: number;
      y: number;
    }
  | {
      type: 'mouseButton';
      button: RDPMouseButton;
      action: RDPMouseButtonAction;
    }
  | {
      type: 'wheel';
      direction: RDPScrollDirection;
      amount: number;
      x?: number;
      y?: number;
    }
  | {
      type: 'keyPress';
      keyName: string;
    }
  | {
      type: 'typeText';
      text: string;
    }
  | {
      type: 'clearInput';
    };

export type RDPProtocolResponse =
  | {
      type: 'ok';
    }
  | {
      type: 'connected';
      info: RDPConnectionInfo;
    }
  | {
      type: 'size';
      size: Size;
    }
  | {
      type: 'screenshot';
      base64: string;
    };

export type RDPHelperRequest = RDPHelperEnvelope<RDPProtocolRequest>;

export type RDPHelperResponse =
  | {
      id: string;
      ok: true;
      payload: RDPProtocolResponse;
    }
  | {
      id: string;
      ok: false;
      error: {
        message: string;
        code?: string;
      };
    };

export interface RDPBackendClient {
  connect(config: RDPConnectionConfig): Promise<RDPConnectionInfo>;
  disconnect(): Promise<void>;
  screenshotBase64(): Promise<string>;
  size(): Promise<Size>;
  mouseMove(x: number, y: number): Promise<void>;
  mouseButton(
    button: RDPMouseButton,
    action: RDPMouseButtonAction,
  ): Promise<void>;
  wheel(
    direction: RDPScrollDirection,
    amount: number,
    x?: number,
    y?: number,
  ): Promise<void>;
  keyPress(keyName: string): Promise<void>;
  typeText(text: string): Promise<void>;
  clearInput?(): Promise<void>;
}
