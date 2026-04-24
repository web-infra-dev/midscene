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
  type ActionTapParam,
  actionTapParamSchema,
  defineAction,
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
      defineActionTap(async ({ locate }) => {
        const element = this.requireLocate(locate, 'tap');
        await this.moveToElement(element, {
          steps: SMOOTH_MOVE_STEPS_TAP,
          stepDelayMs: SMOOTH_MOVE_DELAY_TAP,
        });
        await this.backend.mouseButton('left', 'down');
        await sleep(CLICK_HOLD_DURATION);
        await this.backend.mouseButton('left', 'up');
      }),
      defineActionDoubleClick(async ({ locate }) => {
        const element = this.requireLocate(locate, 'double click');
        await this.moveToElement(element, {
          steps: SMOOTH_MOVE_STEPS_TAP,
          stepDelayMs: SMOOTH_MOVE_DELAY_TAP,
        });
        await this.backend.mouseButton('left', 'doubleClick');
      }),
      defineActionRightClick(async ({ locate }) => {
        const element = this.requireLocate(locate, 'right click');
        await this.moveToElement(element, {
          steps: SMOOTH_MOVE_STEPS_TAP,
          stepDelayMs: SMOOTH_MOVE_DELAY_TAP,
        });
        await this.backend.mouseButton('right', 'click');
      }),
      defineActionHover(async ({ locate }) => {
        const element = this.requireLocate(locate, 'hover');
        await this.moveToElement(element, {
          steps: SMOOTH_MOVE_STEPS_MOUSE_MOVE,
          stepDelayMs: SMOOTH_MOVE_DELAY_MOUSE_MOVE,
          settleDelayMs: MOUSE_MOVE_EFFECT_WAIT,
        });
      }),
      defineActionInput(async (param: ActionInputParam) => {
        this.assertConnected();
        if (param.locate) {
          await this.moveToElement(param.locate, {
            steps: SMOOTH_MOVE_STEPS_TAP,
            stepDelayMs: SMOOTH_MOVE_DELAY_TAP,
          });
          await this.backend.mouseButton('left', 'click');
          await sleep(INPUT_FOCUS_DELAY);
        }
        if (param.mode !== 'typeOnly') {
          await this.clearInput();
          await sleep(INPUT_CLEAR_DELAY);
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
          await this.moveToElement(locate, {
            steps: SMOOTH_MOVE_STEPS_TAP,
            stepDelayMs: SMOOTH_MOVE_DELAY_TAP,
          });
          await this.backend.mouseButton('left', 'click');
          await sleep(INPUT_FOCUS_DELAY);
        }
        await this.clearInput();
        await sleep(INPUT_CLEAR_DELAY);
      }),
      defineActionKeyboardPress(
        async ({ locate, keyName }: ActionKeyboardPressParam) => {
          this.assertConnected();
          if (locate) {
            await this.moveToElement(locate, {
              steps: SMOOTH_MOVE_STEPS_TAP,
              stepDelayMs: SMOOTH_MOVE_DELAY_TAP,
            });
            await this.backend.mouseButton('left', 'click');
          }
          await this.backend.keyPress(keyName);
        },
      ),
      defineActionScroll(async (param: ActionScrollParam) => {
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
          param.distance || DEFAULT_SCROLL_DISTANCE,
          target?.center[0],
          target?.center[1],
        );
        await sleep(SCROLL_COMPLETE_DELAY);
      }),
      defineActionDragAndDrop(async ({ from, to }) => {
        this.assertConnected();
        const source = this.requireLocate(from, 'drag source');
        const target = this.requireLocate(to, 'drag target');
        await this.moveToElement(source, {
          steps: SMOOTH_MOVE_STEPS_TAP,
          stepDelayMs: SMOOTH_MOVE_DELAY_TAP,
        });
        await this.backend.mouseButton('left', 'down');
        await sleep(DRAG_HOLD_DURATION);
        await this.moveToElement(target, {
          steps: SMOOTH_MOVE_STEPS_DRAG,
          stepDelayMs: SMOOTH_MOVE_DELAY_DRAG,
        });
        await sleep(DRAG_HOLD_DURATION);
        await this.backend.mouseButton('left', 'up');
      }),
      defineAction<typeof actionTapParamSchema, ActionTapParam>({
        name: 'MiddleClick',
        description: 'Middle click the element',
        sample: {
          locate: { prompt: 'the browser tab close target' },
        },
        paramSchema: actionTapParamSchema,
        call: async ({ locate }) => {
          const element = this.requireLocate(locate, 'middle click');
          await this.moveToElement(element, {
            steps: SMOOTH_MOVE_STEPS_TAP,
            stepDelayMs: SMOOTH_MOVE_DELAY_TAP,
          });
          await this.backend.mouseButton('middle', 'click');
        },
      }),
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

  private requireLocate(
    locate: LocateResultElement | undefined,
    actionName: string,
  ): LocateResultElement {
    if (!locate) {
      throw new Error(`Missing target element for ${actionName}`);
    }
    return locate;
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
