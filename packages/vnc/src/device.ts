import assert from 'node:assert';
import {
  type DeviceAction,
  type InterfaceType,
  type LocateResultElement,
  type Size,
  getMidsceneLocationSchema,
  z,
} from '@midscene/core';
import {
  type AbstractInterface,
  type ActionHoverParam,
  type ActionTapParam,
  actionHoverParamSchema,
  defineAction,
  defineActionClearInput,
  defineActionDoubleClick,
  defineActionDragAndDrop,
  defineActionKeyboardPress,
  defineActionRightClick,
  defineActionScroll,
  defineActionTap,
} from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { keyToKeysym, modifierToKeysym } from './keysym';
import { VNCClient, VNC_BUTTON, type VNCConnectionOptions } from './vnc-client';

const debugDevice = getDebug('vnc:device');

// Timing constants
const CLICK_HOLD_DURATION = 50;
const DOUBLE_CLICK_INTERVAL = 80;
const INPUT_FOCUS_DELAY = 300;
const INPUT_CLEAR_DELAY = 150;
const SCROLL_STEP_DELAY = 100;
const SCROLL_COMPLETE_DELAY = 500;
const SCROLL_REPEAT_COUNT = 10;
const MOUSE_MOVE_EFFECT_WAIT = 300;
const SMOOTH_MOVE_STEPS = 8;
const SMOOTH_MOVE_DELAY = 8;
const KEY_PRESS_DELAY = 30;

export interface VNCDeviceOpt extends VNCConnectionOptions {
  /** Custom actions to add to the action space */
  customActions?: DeviceAction<any>[];
}

export class VNCDevice implements AbstractInterface {
  interfaceType: InterfaceType = 'vnc';
  private client: VNCClient;
  private options: VNCDeviceOpt;
  private deviceDescription?: string;
  private destroyed = false;

  constructor(options: VNCDeviceOpt) {
    this.options = options;
    this.client = new VNCClient(options);
  }

  describe(): string {
    return this.deviceDescription || 'VNC Remote Device';
  }

  /**
   * Connect to the remote VNC server
   */
  async connect(): Promise<void> {
    debugDevice(
      'Connecting to VNC server at %s:%d',
      this.options.host,
      this.options.port,
    );

    await this.client.connect();

    const screenSize = this.client.getScreenSize();
    const serverName = this.client.getServerName();

    this.deviceDescription = `
Type: VNC Remote Desktop
Server: ${this.options.host}:${this.options.port}
Name: ${serverName}
Screen Size: ${screenSize.width}x${screenSize.height}
`;

    debugDevice('VNC device connected: %s', this.deviceDescription);
  }

  async screenshotBase64(): Promise<string> {
    debugDevice('Taking VNC screenshot');

    const pngBuffer = await this.client.screenshot();
    return createImgBase64ByFormat('png', pngBuffer.toString('base64'));
  }

  async size(): Promise<Size> {
    const screenSize = this.client.getScreenSize();
    return {
      width: screenSize.width,
      height: screenSize.height,
      dpr: 1,
    };
  }

  /**
   * Smooth mouse movement to a target position
   */
  private async smoothMoveMouse(
    targetX: number,
    targetY: number,
    steps: number,
    stepDelay: number,
  ): Promise<void> {
    // We don't have a "getMousePos" in VNC, so we do a direct move in steps
    // from a rough estimate. For VNC we'll just move in interpolated steps.
    // Since we don't track cursor position, move from center of screen as fallback
    const size = this.client.getScreenSize();
    const startX = Math.round(size.width / 2);
    const startY = Math.round(size.height / 2);

    for (let i = 1; i <= steps; i++) {
      const stepX = Math.round(startX + ((targetX - startX) * i) / steps);
      const stepY = Math.round(startY + ((targetY - startY) * i) / steps);
      this.client.pointerEvent(stepX, stepY, 0);
      await sleep(stepDelay);
    }
  }

  /**
   * Type text character by character via VNC key events
   */
  private async typeText(text: string): Promise<void> {
    for (const char of text) {
      const keysym = keyToKeysym(char);
      this.client.keyEvent(keysym, true);
      this.client.keyEvent(keysym, false);
      await sleep(KEY_PRESS_DELAY);
    }
  }

  actionSpace(): DeviceAction<any>[] {
    const defaultActions: DeviceAction<any>[] = [
      // Tap (single click)
      defineActionTap(async (param: ActionTapParam) => {
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot tap');
        const [x, y] = element.center;
        const targetX = Math.round(x);
        const targetY = Math.round(y);

        // Move to position
        this.client.pointerEvent(targetX, targetY, 0);
        await sleep(SMOOTH_MOVE_DELAY);

        // Press and release left button
        this.client.pointerEvent(targetX, targetY, VNC_BUTTON.LEFT);
        await sleep(CLICK_HOLD_DURATION);
        this.client.pointerEvent(targetX, targetY, 0);
      }),

      // DoubleClick
      defineActionDoubleClick(async (param) => {
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot double click');
        const [x, y] = element.center;
        const targetX = Math.round(x);
        const targetY = Math.round(y);

        // First click
        this.client.pointerEvent(targetX, targetY, VNC_BUTTON.LEFT);
        await sleep(CLICK_HOLD_DURATION);
        this.client.pointerEvent(targetX, targetY, 0);
        await sleep(DOUBLE_CLICK_INTERVAL);

        // Second click
        this.client.pointerEvent(targetX, targetY, VNC_BUTTON.LEFT);
        await sleep(CLICK_HOLD_DURATION);
        this.client.pointerEvent(targetX, targetY, 0);
      }),

      // RightClick
      defineActionRightClick(async (param) => {
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot right click');
        const [x, y] = element.center;
        const targetX = Math.round(x);
        const targetY = Math.round(y);

        this.client.pointerEvent(targetX, targetY, 0);
        await sleep(SMOOTH_MOVE_DELAY);
        this.client.pointerEvent(targetX, targetY, VNC_BUTTON.RIGHT);
        await sleep(CLICK_HOLD_DURATION);
        this.client.pointerEvent(targetX, targetY, 0);
      }),

      // MouseMove (Hover)
      defineAction<typeof actionHoverParamSchema, ActionHoverParam>({
        name: 'MouseMove',
        description: 'Move the mouse to the element',
        interfaceAlias: 'aiHover',
        paramSchema: actionHoverParamSchema,
        call: async (param) => {
          const element = param.locate as LocateResultElement;
          assert(element, 'Element not found, cannot move mouse');
          const [x, y] = element.center;
          const targetX = Math.round(x);
          const targetY = Math.round(y);

          await this.smoothMoveMouse(
            targetX,
            targetY,
            SMOOTH_MOVE_STEPS,
            SMOOTH_MOVE_DELAY,
          );
          await sleep(MOUSE_MOVE_EFFECT_WAIT);
        },
      }),

      // Input
      defineAction({
        name: 'Input',
        description: 'Input text into the input field',
        interfaceAlias: 'aiInput',
        paramSchema: z.object({
          value: z.string().describe('The text to input'),
          mode: z
            .enum(['replace', 'clear', 'append'])
            .default('replace')
            .optional()
            .describe('Input mode: replace, clear, or append'),
          locate: getMidsceneLocationSchema()
            .describe('The input field to be filled')
            .optional(),
        }),
        call: async (param) => {
          const element = param.locate as LocateResultElement | undefined;

          if (element) {
            // Click to focus
            const [x, y] = element.center;
            const targetX = Math.round(x);
            const targetY = Math.round(y);

            this.client.pointerEvent(targetX, targetY, VNC_BUTTON.LEFT);
            await sleep(CLICK_HOLD_DURATION);
            this.client.pointerEvent(targetX, targetY, 0);
            await sleep(INPUT_FOCUS_DELAY);

            if (param.mode !== 'append') {
              // Select all (Ctrl+A) and delete
              this.client.keyEvent(keyToKeysym('ctrl'), true);
              this.client.keyEvent(keyToKeysym('a'), true);
              this.client.keyEvent(keyToKeysym('a'), false);
              this.client.keyEvent(keyToKeysym('ctrl'), false);
              await sleep(50);

              this.client.keyEvent(keyToKeysym('backspace'), true);
              this.client.keyEvent(keyToKeysym('backspace'), false);
              await sleep(INPUT_CLEAR_DELAY);
            }
          }

          if (param.mode === 'clear') {
            return;
          }

          if (!param.value) {
            return;
          }

          await this.typeText(param.value);
        },
      }),

      // Scroll
      defineActionScroll(async (param) => {
        let scrollX: number | undefined;
        let scrollY: number | undefined;

        if (param.locate) {
          const element = param.locate as LocateResultElement;
          const [x, y] = element.center;
          scrollX = Math.round(x);
          scrollY = Math.round(y);
        } else {
          // Default to center of screen
          const screenSize = this.client.getScreenSize();
          scrollX = Math.round(screenSize.width / 2);
          scrollY = Math.round(screenSize.height / 2);
        }

        // Move cursor to scroll position
        this.client.pointerEvent(scrollX, scrollY, 0);

        const scrollType = param?.scrollType;

        // Scroll to edge actions
        const scrollToEdgeActions: Record<string, number> = {
          scrollToTop: VNC_BUTTON.SCROLL_UP,
          scrollToBottom: VNC_BUTTON.SCROLL_DOWN,
          scrollToLeft: VNC_BUTTON.SCROLL_LEFT,
          scrollToRight: VNC_BUTTON.SCROLL_RIGHT,
        };

        const edgeButton = scrollToEdgeActions[scrollType || ''];
        if (edgeButton) {
          for (let i = 0; i < SCROLL_REPEAT_COUNT; i++) {
            this.client.pointerEvent(scrollX, scrollY, edgeButton);
            await sleep(SCROLL_STEP_DELAY);
            this.client.pointerEvent(scrollX, scrollY, 0);
          }
          return;
        }

        // Single scroll action
        if (scrollType === 'singleAction' || !scrollType) {
          const distance = param?.distance || 500;
          const ticks = Math.ceil(distance / 100);
          const direction = param?.direction || 'down';

          const directionMap: Record<string, number> = {
            up: VNC_BUTTON.SCROLL_UP,
            down: VNC_BUTTON.SCROLL_DOWN,
            left: VNC_BUTTON.SCROLL_LEFT,
            right: VNC_BUTTON.SCROLL_RIGHT,
          };

          const button = directionMap[direction] || VNC_BUTTON.SCROLL_DOWN;

          for (let i = 0; i < ticks; i++) {
            this.client.pointerEvent(scrollX, scrollY, button);
            await sleep(50);
            this.client.pointerEvent(scrollX, scrollY, 0);
            await sleep(50);
          }
          await sleep(SCROLL_COMPLETE_DELAY);
          return;
        }

        throw new Error(
          `Unknown scroll type: ${scrollType}, param: ${JSON.stringify(param)}`,
        );
      }),

      // KeyboardPress
      defineActionKeyboardPress(async (param) => {
        if (param.locate) {
          const [x, y] = param.locate.center;
          const targetX = Math.round(x);
          const targetY = Math.round(y);
          this.client.pointerEvent(targetX, targetY, VNC_BUTTON.LEFT);
          await sleep(CLICK_HOLD_DURATION);
          this.client.pointerEvent(targetX, targetY, 0);
          await sleep(50);
        }

        const keys = param.keyName.split('+');
        const modifiers = keys.slice(0, -1);
        const mainKey = keys[keys.length - 1];

        debugDevice('KeyboardPress: key=%s, modifiers=%o', mainKey, modifiers);

        // Press modifiers
        for (const mod of modifiers) {
          this.client.keyEvent(modifierToKeysym(mod), true);
        }

        // Press and release the main key
        const mainKeysym = keyToKeysym(mainKey);
        this.client.keyEvent(mainKeysym, true);
        await sleep(KEY_PRESS_DELAY);
        this.client.keyEvent(mainKeysym, false);

        // Release modifiers (in reverse order)
        for (const mod of [...modifiers].reverse()) {
          this.client.keyEvent(modifierToKeysym(mod), false);
        }
      }),

      // DragAndDrop
      defineActionDragAndDrop(async (param) => {
        const from = param.from as LocateResultElement;
        const to = param.to as LocateResultElement;
        assert(from, 'missing "from" param for drag and drop');
        assert(to, 'missing "to" param for drag and drop');

        const [fromX, fromY] = from.center;
        const [toX, toY] = to.center;

        // Move to start position
        this.client.pointerEvent(Math.round(fromX), Math.round(fromY), 0);
        await sleep(50);

        // Press left button (start drag)
        this.client.pointerEvent(
          Math.round(fromX),
          Math.round(fromY),
          VNC_BUTTON.LEFT,
        );
        await sleep(100);

        // Move to target (with button held)
        this.client.pointerEvent(
          Math.round(toX),
          Math.round(toY),
          VNC_BUTTON.LEFT,
        );
        await sleep(100);

        // Release button (drop)
        this.client.pointerEvent(Math.round(toX), Math.round(toY), 0);
      }),

      // ClearInput
      defineActionClearInput(async (param) => {
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot clear input');

        const [x, y] = element.center;
        const targetX = Math.round(x);
        const targetY = Math.round(y);

        // Click to focus
        this.client.pointerEvent(targetX, targetY, VNC_BUTTON.LEFT);
        await sleep(CLICK_HOLD_DURATION);
        this.client.pointerEvent(targetX, targetY, 0);
        await sleep(100);

        // Select all (Ctrl+A) and delete
        this.client.keyEvent(keyToKeysym('ctrl'), true);
        this.client.keyEvent(keyToKeysym('a'), true);
        this.client.keyEvent(keyToKeysym('a'), false);
        this.client.keyEvent(keyToKeysym('ctrl'), false);
        await sleep(50);

        this.client.keyEvent(keyToKeysym('backspace'), true);
        this.client.keyEvent(keyToKeysym('backspace'), false);
        await sleep(50);
      }),
    ];

    const customActions = this.options?.customActions || [];
    return [...defaultActions, ...customActions];
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.client.disconnect();
    debugDevice('VNC device destroyed');
  }

  async url(): Promise<string> {
    return `vnc://${this.options.host}:${this.options.port}`;
  }
}
