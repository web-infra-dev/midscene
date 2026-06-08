import type {
  ActionScrollParam,
  DeviceAction,
  InterfaceType,
  LocateResultElement,
  Size,
} from '@midscene/core';
import {
  type AbstractInterface,
  type ComputerInputPrimitives,
  defineAction,
  defineActionsFromInputPrimitives,
} from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import { getDebug } from '@midscene/shared/logger';
import type { DisplayInfo } from '../device';
import { createDefaultRDPBackendClient } from './backend-client';
import type {
  RDPBackendClient,
  RDPConnectionConfig,
  RDPConnectionInfo,
  RDPScrollDirection,
} from './protocol';

const debug = getDebug('rdp:device');

const SMOOTH_MOVE_STEPS_TAP = 8;
const SMOOTH_MOVE_STEPS_MOUSE_MOVE = 10;
const SMOOTH_MOVE_STEPS_DRAG = 12;
const SMOOTH_MOVE_DELAY_TAP = 8;
const SMOOTH_MOVE_DELAY_MOUSE_MOVE = 10;
const SMOOTH_MOVE_DELAY_DRAG = 10;
const MOUSE_MOVE_EFFECT_WAIT = 300;
const CLICK_HOLD_DURATION = 50;
const DRAG_HOLD_DURATION = 100;
const INPUT_FOCUS_DELAY = 300;
const INPUT_CLEAR_DELAY = 150;
const SCROLL_STEP_DELAY = 100;
const SCROLL_COMPLETE_DELAY = 500;
const DEFAULT_SCROLL_DISTANCE = 480;
const DEFAULT_SCROLL_VIEWPORT_RATIO = 0.7;
const EDGE_SCROLL_STEPS = 10;
const DEFAULT_SCROLL_STEP_AMOUNT = 120;

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
  private cursorPosition?: [number, number];
  uri?: string;

  readonly inputPrimitives: ComputerInputPrimitives = {
    pointer: {
      tap: async ({ x, y }) => {
        await this.movePointer(Math.round(x), Math.round(y), {
          steps: SMOOTH_MOVE_STEPS_TAP,
          stepDelayMs: SMOOTH_MOVE_DELAY_TAP,
        });
        await this.backend.mouseButton('left', 'down');
        await sleep(CLICK_HOLD_DURATION);
        await this.backend.mouseButton('left', 'up');
      },
      doubleClick: async ({ x, y }) => {
        await this.movePointer(Math.round(x), Math.round(y), {
          steps: SMOOTH_MOVE_STEPS_TAP,
          stepDelayMs: SMOOTH_MOVE_DELAY_TAP,
        });
        await this.backend.mouseButton('left', 'doubleClick');
      },
      rightClick: async ({ x, y }) => {
        await this.movePointer(Math.round(x), Math.round(y), {
          steps: SMOOTH_MOVE_STEPS_TAP,
          stepDelayMs: SMOOTH_MOVE_DELAY_TAP,
        });
        await this.backend.mouseButton('right', 'click');
      },
      hover: async ({ x, y }) => {
        await this.movePointer(Math.round(x), Math.round(y), {
          steps: SMOOTH_MOVE_STEPS_MOUSE_MOVE,
          stepDelayMs: SMOOTH_MOVE_DELAY_MOUSE_MOVE,
          settleDelayMs: MOUSE_MOVE_EFFECT_WAIT,
        });
      },
      dragAndDrop: async (from, to) => {
        await this.movePointer(Math.round(from.x), Math.round(from.y), {
          steps: SMOOTH_MOVE_STEPS_TAP,
          stepDelayMs: SMOOTH_MOVE_DELAY_TAP,
        });
        await this.backend.mouseButton('left', 'down');
        await sleep(DRAG_HOLD_DURATION);
        await this.movePointer(Math.round(to.x), Math.round(to.y), {
          steps: SMOOTH_MOVE_STEPS_DRAG,
          stepDelayMs: SMOOTH_MOVE_DELAY_DRAG,
        });
        await sleep(DRAG_HOLD_DURATION);
        await this.backend.mouseButton('left', 'up');
      },
    },
    keyboard: {
      typeText: async (value, opts) => {
        this.assertConnected();
        const target = opts?.target as LocateResultElement | undefined;
        if (target) {
          await this.inputPrimitives.pointer!.tap({
            x: target.center[0],
            y: target.center[1],
          });
          await sleep(INPUT_FOCUS_DELAY);
        }
        if (opts?.replace !== false) {
          await this.clearInput();
          await sleep(INPUT_CLEAR_DELAY);
        }
        if (opts?.focusOnly || !value) {
          return;
        }
        await this.backend.typeText(value);
      },
      clearInput: async (target) => {
        this.assertConnected();
        const element = target as LocateResultElement | undefined;
        if (element) {
          await this.inputPrimitives.pointer!.tap({
            x: element.center[0],
            y: element.center[1],
          });
          await sleep(INPUT_FOCUS_DELAY);
        }
        await this.clearInput();
        await sleep(INPUT_CLEAR_DELAY);
      },
      keyboardPress: async (keyName, opts) => {
        this.assertConnected();
        const target = opts?.target as LocateResultElement | undefined;
        if (target) {
          await this.inputPrimitives.pointer!.tap({
            x: target.center[0],
            y: target.center[1],
          });
        }
        await this.backend.keyPress(keyName);
      },
    },
    scroll: {
      scroll: async (param) => {
        this.assertConnected();
        const target = param.locate;
        if (target) {
          await this.moveToElement(target, {
            steps: SMOOTH_MOVE_STEPS_MOUSE_MOVE,
            stepDelayMs: SMOOTH_MOVE_DELAY_MOUSE_MOVE,
          });
        }
        if (param.scrollType && param.scrollType !== 'singleAction') {
          const direction = this.edgeScrollDirection(param.scrollType);
          for (let i = 0; i < EDGE_SCROLL_STEPS; i++) {
            await this.performWheel(
              direction,
              DEFAULT_SCROLL_DISTANCE,
              target?.center[0],
              target?.center[1],
            );
          }
          await sleep(SCROLL_COMPLETE_DELAY);
          return;
        }
        await this.performWheel(
          param.direction || 'down',
          param.distance ||
            this.defaultScrollDistance(param.direction || 'down'),
          target?.center[0],
          target?.center[1],
        );
        await sleep(SCROLL_COMPLETE_DELAY);
      },
    },
  };

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
    // Only forward serializable connection settings. `backend` and
    // `customActions` are runtime objects (the backend instance even holds a
    // live child process with circular references); leaking them into the
    // config sent over the helper's JSON protocol corrupts the request line.
    const {
      backend: _backend,
      customActions: _customActions,
      ...config
    } = this.options;
    this.connectionInfo = await this.backend.connect(config);
    this.cursorPosition = [
      Math.round(this.connectionInfo.size.width / 2),
      Math.round(this.connectionInfo.size.height / 2),
    ];
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
    this.connectionInfo = undefined;
    this.cursorPosition = undefined;
    await this.backend.disconnect();
  }

  actionSpace(): DeviceAction<any>[] {
    const defaultActions: DeviceAction<any>[] = [
      ...defineActionsFromInputPrimitives(this.inputPrimitives),
      defineAction({
        name: 'ListDisplays',
        description: 'List all available displays/monitors',
        call: async (): Promise<DisplayInfo[]> => {
          this.assertConnected();
          const size = await this.size();
          return [
            {
              id: this.connectionInfo?.sessionId || this.options.host,
              name: `RDP ${this.connectionInfo?.server || this.options.host} (${size.width}x${size.height})`,
              primary: true,
            },
          ];
        },
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

  private async moveToElement(
    element: LocateResultElement,
    options?: {
      steps?: number;
      stepDelayMs?: number;
      settleDelayMs?: number;
    },
  ): Promise<void> {
    this.assertConnected();
    const targetX = Math.round(element.center[0]);
    const targetY = Math.round(element.center[1]);
    await this.movePointer(targetX, targetY, options);
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

  private defaultScrollDistance(direction: RDPScrollDirection): number {
    const size = this.connectionInfo?.size;
    if (!size) {
      return DEFAULT_SCROLL_DISTANCE;
    }
    const isHorizontal = direction === 'left' || direction === 'right';
    const base = isHorizontal ? size.width : size.height;
    return Math.max(1, Math.round(base * DEFAULT_SCROLL_VIEWPORT_RATIO));
  }

  private async movePointer(
    targetX: number,
    targetY: number,
    options?: {
      steps?: number;
      stepDelayMs?: number;
      settleDelayMs?: number;
    },
  ): Promise<void> {
    this.assertConnected();
    const start = this.cursorPosition || [targetX, targetY];
    const steps = Math.max(1, options?.steps || 1);
    const stepDelayMs = options?.stepDelayMs || 0;

    for (let step = 1; step <= steps; step++) {
      const x = Math.round(start[0] + ((targetX - start[0]) * step) / steps);
      const y = Math.round(start[1] + ((targetY - start[1]) * step) / steps);
      await this.backend.mouseMove(x, y);
      this.cursorPosition = [x, y];
      if (stepDelayMs > 0 && step < steps) {
        await sleep(stepDelayMs);
      }
    }

    if (options?.settleDelayMs) {
      await sleep(options.settleDelayMs);
    }
  }

  private async performWheel(
    direction: RDPScrollDirection,
    amount: number,
    x?: number,
    y?: number,
  ): Promise<void> {
    let remaining = Math.abs(amount);
    if (remaining === 0) {
      remaining = DEFAULT_SCROLL_STEP_AMOUNT;
    }

    while (remaining > 0) {
      const chunk = Math.min(remaining, DEFAULT_SCROLL_STEP_AMOUNT);
      await this.backend.wheel(direction, chunk, x, y);
      remaining -= chunk;
      if (remaining > 0) {
        await sleep(SCROLL_STEP_DELAY);
      }
    }
  }
}
