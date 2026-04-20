import type {
  ActionScrollParam,
  DeviceAction,
  InterfaceType,
  LocateResultElement,
  Size,
} from '@midscene/core';
import {
  type AbstractInterface,
  type ActionInputParam,
  type ActionKeyboardPressParam,
  defineActionClearInput,
  defineActionDoubleClick,
  defineActionDragAndDrop,
  defineActionHover,
  defineActionInput,
  defineActionKeyboardPress,
  defineActionRightClick,
  defineActionScroll,
  defineActionTap,
} from '@midscene/core/device';
import { getDebug } from '@midscene/shared/logger';
import {
  UnsupportedRDPBackendClient,
  createDefaultRDPBackendClient,
} from './backend-client';
import type {
  RDPBackendClient,
  RDPConnectionConfig,
  RDPConnectionInfo,
  RDPScrollDirection,
} from './protocol';

const debug = getDebug('rdp:device');

const DEFAULT_SCROLL_DISTANCE = 480;
const EDGE_SCROLL_STEPS = 8;

export interface RDPDeviceOpt extends RDPConnectionConfig {
  backend?: RDPBackendClient;
  customActions?: DeviceAction<any>[];
}

export class RDPDevice implements AbstractInterface {
  interfaceType: InterfaceType = 'rdp';

  private readonly options: RDPDeviceOpt;
  private readonly backend: RDPBackendClient;
  private connectionInfo?: RDPConnectionInfo;
  private destroyed = false;
  uri?: string;

  constructor(options: RDPDeviceOpt) {
    this.options = {
      port: 3389,
      securityProtocol: 'auto',
      ignoreCertificate: false,
      ...options,
    };
    this.backend = options.backend || createDefaultRDPBackendClient();
  }

  describe(): string {
    const port = this.options.port || 3389;
    const username = this.options.username
      ? ` as ${this.options.username}`
      : '';
    const session = this.connectionInfo?.sessionId
      ? ` [session ${this.connectionInfo.sessionId}]`
      : '';
    return `RDP Device ${this.options.host}:${port}${username}${session}`;
  }

  async connect(): Promise<void> {
    this.throwIfDestroyed();
    debug('connecting to rdp backend', {
      host: this.options.host,
      port: this.options.port,
      username: this.options.username,
    });
    this.connectionInfo = await this.backend.connect(this.options);
  }

  async screenshotBase64(): Promise<string> {
    this.assertConnected();
    return this.backend.screenshotBase64();
  }

  async size(): Promise<Size> {
    this.assertConnected();
    return this.backend.size();
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    await this.backend.disconnect();
  }

  actionSpace(): DeviceAction<any>[] {
    const defaultActions: DeviceAction<any>[] = [
      defineActionTap(async ({ locate }) => {
        const element = this.requireLocate(locate, 'tap');
        await this.moveToElement(element);
        await this.backend.mouseButton('left', 'click');
      }),
      defineActionDoubleClick(async ({ locate }) => {
        const element = this.requireLocate(locate, 'double click');
        await this.moveToElement(element);
        await this.backend.mouseButton('left', 'doubleClick');
      }),
      defineActionRightClick(async ({ locate }) => {
        const element = this.requireLocate(locate, 'right click');
        await this.moveToElement(element);
        await this.backend.mouseButton('right', 'click');
      }),
      defineActionHover(async ({ locate }) => {
        const element = this.requireLocate(locate, 'hover');
        await this.moveToElement(element);
      }),
      defineActionInput(async (param: ActionInputParam) => {
        this.assertConnected();
        if (param.locate) {
          await this.moveToElement(param.locate);
          await this.backend.mouseButton('left', 'click');
        }
        if (param.mode !== 'typeOnly') {
          await this.clearInput();
        }
        if (param.mode === 'clear') {
          return;
        }
        if (param.value) {
          await this.backend.typeText(param.value);
        }
      }),
      defineActionClearInput(async ({ locate }) => {
        this.assertConnected();
        if (locate) {
          await this.moveToElement(locate);
          await this.backend.mouseButton('left', 'click');
        }
        await this.clearInput();
      }),
      defineActionKeyboardPress(
        async ({ locate, keyName }: ActionKeyboardPressParam) => {
          this.assertConnected();
          if (locate) {
            await this.moveToElement(locate);
            await this.backend.mouseButton('left', 'click');
          }
          await this.backend.keyPress(keyName);
        },
      ),
      defineActionScroll(async (param: ActionScrollParam) => {
        this.assertConnected();
        const target = param.locate;
        if (target) {
          await this.moveToElement(target);
        }
        if (param.scrollType && param.scrollType !== 'singleAction') {
          const direction = this.edgeScrollDirection(param.scrollType);
          for (let i = 0; i < EDGE_SCROLL_STEPS; i++) {
            await this.backend.wheel(
              direction,
              DEFAULT_SCROLL_DISTANCE,
              target?.center[0],
              target?.center[1],
            );
          }
          return;
        }
        await this.backend.wheel(
          param.direction || 'down',
          param.distance || DEFAULT_SCROLL_DISTANCE,
          target?.center[0],
          target?.center[1],
        );
      }),
      defineActionDragAndDrop(async ({ from, to }) => {
        this.assertConnected();
        const source = this.requireLocate(from, 'drag source');
        const target = this.requireLocate(to, 'drag target');
        await this.moveToElement(source);
        await this.backend.mouseButton('left', 'down');
        await this.moveToElement(target);
        await this.backend.mouseButton('left', 'up');
      }),
    ];

    return [...defaultActions, ...(this.options.customActions || [])];
  }

  private assertConnected(): void {
    this.throwIfDestroyed();
    if (!this.connectionInfo) {
      throw new Error('RDPDevice is not connected');
    }
  }

  private throwIfDestroyed(): void {
    if (this.destroyed) {
      throw new Error('RDPDevice has been destroyed');
    }
  }

  private requireLocate(
    locate: LocateResultElement | undefined,
    actionName: string,
  ): LocateResultElement {
    if (!locate) {
      throw new Error(`Missing target element for ${actionName}`);
    }
    return locate;
  }

  private async moveToElement(element: LocateResultElement): Promise<void> {
    this.assertConnected();
    await this.backend.mouseMove(
      Math.round(element.center[0]),
      Math.round(element.center[1]),
    );
  }

  private async clearInput(): Promise<void> {
    if (this.backend.clearInput) {
      await this.backend.clearInput();
      return;
    }
    await this.backend.keyPress('Control+A');
    await this.backend.keyPress('Backspace');
  }

  private edgeScrollDirection(
    scrollType: NonNullable<ActionScrollParam['scrollType']>,
  ): RDPScrollDirection {
    switch (scrollType) {
      case 'scrollToTop':
        return 'up';
      case 'scrollToBottom':
        return 'down';
      case 'scrollToLeft':
        return 'left';
      case 'scrollToRight':
        return 'right';
      case 'singleAction':
        return 'down';
      default:
        throw new Error(`Unsupported scroll type: ${scrollType}`);
    }
  }
}

export { UnsupportedRDPBackendClient };
