import type {
  ActionScrollParam,
  DeviceAction,
  InterfaceType,
  LocateResultElement,
  Size,
} from '@midscene/core';
import {
  type AbstractInterface,
  type InputPrimitives,
  type PointerPoint,
  defineActionHover,
  defineActionsFromInputPrimitives,
} from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import {
  type ScreenRelayCapabilities,
  type ScreenRelayClient,
  type ScreenRelayInputEvent,
  createDefaultScreenRelayClient,
  formatScreenRelayError,
  isRelayError,
} from './client';
import {
  DEFAULT_SCREEN_RELAY_TIMEOUT_MS,
  type ResolvedScreenRelayTarget,
  normalizeScreenRelayKey,
  parseScreenRelayTarget,
  readPngDimensions,
} from './target';

const debug = getDebug('screen-relay');

const DOUBLE_CLICK_GAP_MS = 80;
const FOCUS_SETTLE_MS = 150;
const DRAG_STEPS = 12;
const DRAG_STEP_DELAY_MS = 15;
const DEFAULT_SCROLL_DISTANCE_PX = 480;
const PIXELS_PER_WHEEL_NOTCH = 120;
const EDGE_SCROLL_NOTCHES = 24;

export interface ScreenRelayDeviceOpt {
  /**
   * screen-relay server URL or full Viewer URL (automatically parses `#token=`).
   * Defaults to `MIDSCENE_SCREEN_RELAY_URL` or `http://127.0.0.1:8080`.
   */
  url?: string;
  /**
   * Session token (overrides any `#token=` in `url`).
   * Defaults to `MIDSCENE_SCREEN_RELAY_TOKEN`.
   */
  token?: string;
  /**
   * Per-request timeout in milliseconds.
   * @default 15000
   */
  timeoutMs?: number;
  /**
   * Additional custom actions appended to the device action space.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customActions?: DeviceAction<any>[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function canClick(input?: ScreenRelayCapabilities['input']): boolean {
  return !input || (input.pointer && input.buttons);
}

function isMacBackend(backend: string | undefined): boolean {
  if (!backend) return false;
  const lower = backend.toLowerCase();
  return lower.includes('mac') || lower.includes('darwin');
}

function extractTargetPoint(target: unknown): PointerPoint | undefined {
  if (!target || typeof target !== 'object') return undefined;
  const center = (target as Partial<LocateResultElement>).center;
  if (
    Array.isArray(center) &&
    center.length >= 2 &&
    typeof center[0] === 'number' &&
    typeof center[1] === 'number'
  ) {
    return { x: center[0], y: center[1] };
  }
  return undefined;
}

function containsNonLatin1(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0xff) return true;
  }
  return false;
}

export class ScreenRelayDevice implements AbstractInterface {
  interfaceType: InterfaceType = 'screen-relay';

  private readonly target: ResolvedScreenRelayTarget;
  private readonly timeoutMs: number;
  private readonly customActions: DeviceAction<any>[];
  private client: ScreenRelayClient;
  private capabilities?: ScreenRelayCapabilities;
  private currentSize?: Size;
  private connected = false;
  private destroyed = false;

  constructor(options?: ScreenRelayDeviceOpt) {
    this.target = parseScreenRelayTarget({
      url: options?.url,
      token: options?.token,
    });
    if (
      options?.timeoutMs !== undefined &&
      (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
    ) {
      throw new Error(
        `Invalid timeoutMs "${options.timeoutMs}". Expected a finite positive number.`,
      );
    }
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_SCREEN_RELAY_TIMEOUT_MS;
    this.customActions = options?.customActions ?? [];
    this.client = createDefaultScreenRelayClient({
      url: this.target.url,
      token: this.target.token,
      timeout: this.timeoutMs,
    });
  }

  /**
   * Connect to the screen-relay server and probe its capabilities.
   */
  async connect(): Promise<ScreenRelayCapabilities> {
    if (this.destroyed) {
      throw new Error(
        'ScreenRelayDevice has been destroyed. Create a new ScreenRelayDevice instance to reconnect.',
      );
    }

    const startedAt = performance.now();
    let caps: ScreenRelayCapabilities;
    try {
      caps = await this.client.capabilities();
    } catch (error) {
      throw formatScreenRelayError('connect', error);
    }

    if (!caps.screenshot) {
      throw new Error(
        `screen-relay at ${this.target.url} does not expose screenshot capability.`,
      );
    }

    this.capabilities = caps;
    if (caps.width > 0 && caps.height > 0) {
      this.currentSize = { width: caps.width, height: caps.height };
    }
    this.connected = true;
    debug(
      'Connected to screen-relay %s in %d ms (backend=%s, %dx%d, input=%o)',
      this.target.url,
      Math.round(performance.now() - startedAt),
      caps.backend,
      caps.width,
      caps.height,
      caps.input,
    );
    return caps;
  }

  getCapabilities(): ScreenRelayCapabilities | undefined {
    return this.capabilities;
  }

  describe(): string {
    const parts = [this.target.url];
    if (this.capabilities?.backend) {
      parts.push(this.capabilities.backend);
    }
    if (this.currentSize) {
      parts.push(`${this.currentSize.width}x${this.currentSize.height}`);
    }
    return `ScreenRelay (${parts.join(', ')})`;
  }

  async size(): Promise<Size> {
    this.assertReady();
    if (!this.currentSize) {
      await this.screenshotBase64();
    }
    if (!this.currentSize) {
      throw new Error(
        `Unable to determine screen size from screen-relay at ${this.target.url}.`,
      );
    }
    return { ...this.currentSize };
  }

  async screenshotBase64(): Promise<string> {
    this.assertReady();
    const startedAt = performance.now();
    let bytes: Uint8Array;
    try {
      bytes = await this.client.screenshot();
    } catch (error) {
      throw formatScreenRelayError('screenshot', error);
    }
    debug(
      'Received screenshot in %d ms (%d PNG bytes)',
      Math.round(performance.now() - startedAt),
      bytes.byteLength,
    );

    const dims = readPngDimensions(bytes);
    if (dims) {
      this.currentSize = dims;
    }

    return createImgBase64ByFormat(
      'png',
      Buffer.from(bytes).toString('base64'),
    );
  }

  /** Build the CLI action catalog without creating or connecting a device. */
  static actionCatalog(inputCaps?: ScreenRelayCapabilities['input']) {
    return ScreenRelayDevice.defineActions(inputCaps, () => {
      throw new Error('Screen relay action requires a device.');
    });
  }

  actionSpace(): DeviceAction<any>[] {
    return [
      ...ScreenRelayDevice.defineActions(this.capabilities?.input, () => this),
      ...this.customActions,
    ];
  }

  private static defineActions(
    inputCaps: ScreenRelayCapabilities['input'] | undefined,
    getDevice: () => ScreenRelayDevice,
  ): DeviceAction<any>[] {
    const allowClick = canClick(inputCaps);
    const allowKeyboard = inputCaps ? inputCaps.keyboard : true;
    const allowWheel = inputCaps ? inputCaps.wheel : true;
    const hover = (point: PointerPoint) => getDevice().moveTo(point);

    const primitives: InputPrimitives = {};

    if (allowClick) {
      primitives.pointer = {
        tap: (point) => getDevice().clickAt(point, 'left'),
        doubleClick: async (point) => {
          await getDevice().clickAt(point, 'left');
          await sleep(DOUBLE_CLICK_GAP_MS);
          await getDevice().clickAt(point, 'left');
        },
        rightClick: (point) => getDevice().clickAt(point, 'right'),
        middleClick: (point) => getDevice().clickAt(point, 'middle'),
        hover,
        dragAndDrop: (from, to) => getDevice().dragFromTo(from, to),
        swipe: async (from, to, opts) => {
          const repeat = Math.max(1, opts?.repeat ?? 1);
          for (let i = 0; i < repeat; i++) {
            await getDevice().dragFromTo(from, to, opts?.duration);
          }
        },
      };
    }

    if (allowKeyboard) {
      primitives.keyboard = {
        keyboardPress: async (keyName, opts) => {
          const target = getDevice();
          await target.focusTarget(opts?.target);
          await target.pressKey(keyName);
        },
        typeText: async (value, opts) => {
          const target = getDevice();
          await target.focusTarget(opts?.target);
          if (opts?.replace) {
            await target.clearActiveInput();
          }
          if (value.length > 0) {
            await target.insertText(value);
          }
        },
        clearInput: async (target) => {
          const device = getDevice();
          await device.focusTarget(target);
          await device.clearActiveInput();
        },
      };
    }

    if (allowWheel) {
      primitives.scroll = {
        scroll: (param) => getDevice().scrollScreen(param),
      };
    }

    const actions = defineActionsFromInputPrimitives(primitives, {
      size: () => getDevice().size(),
    });

    if (inputCaps?.pointer && !allowClick) {
      actions.push(defineActionHover(hover));
    }

    return actions;
  }

  async destroy(): Promise<void> {
    this.connected = false;
    this.destroyed = true;
  }

  private assertReady(): void {
    if (this.destroyed) {
      throw new Error('ScreenRelayDevice has been destroyed.');
    }
    if (!this.connected) {
      throw new Error(
        'ScreenRelayDevice is not connected. Call connect() first.',
      );
    }
  }

  private async focusTarget(target: unknown): Promise<void> {
    const point = extractTargetPoint(target);
    if (!point || !canClick(this.capabilities?.input)) return;
    await this.clickAt(point, 'left');
    await sleep(FOCUS_SETTLE_MS);
  }

  private async toNormalized(
    point: PointerPoint,
  ): Promise<{ x: number; y: number }> {
    const { width, height } = await this.size();
    return {
      x: clamp01(point.x / width),
      y: clamp01(point.y / height),
    };
  }

  private async runInput<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    this.assertReady();
    try {
      return await fn();
    } catch (error) {
      throw formatScreenRelayError(operation, error);
    }
  }

  private async clickAt(
    point: PointerPoint,
    button: 'left' | 'middle' | 'right',
  ): Promise<void> {
    const { x, y } = await this.toNormalized(point);
    await this.runInput(`click(${button})`, () =>
      this.client.click(x, y, { button }),
    );
  }

  private async moveTo(point: PointerPoint): Promise<void> {
    const { x, y } = await this.toNormalized(point);
    await this.runInput('move', () => this.client.move(x, y));
  }

  private async dragFromTo(
    from: PointerPoint,
    to: PointerPoint,
    durationMs?: number,
  ): Promise<void> {
    const start = await this.toNormalized(from);
    const end = await this.toNormalized(to);
    const stepDelayMs =
      durationMs !== undefined && durationMs > 0
        ? Math.max(5, Math.round(durationMs / DRAG_STEPS))
        : DRAG_STEP_DELAY_MS;

    const openSession = this.client.openControlSession;
    const session = openSession
      ? await this.runInput('drag:connect', () => openSession())
      : undefined;
    if (session) {
      debug('Opened /control session for drag');
    }

    const sendEvent = (op: string, event: ScreenRelayInputEvent) =>
      this.runInput(op, async () => {
        if (session) {
          await session.input(event);
        } else {
          await this.client.input([event]);
        }
      });

    let current = start;
    let buttonPressed = false;
    let primaryError: unknown;
    let releaseError: unknown;
    try {
      await sendEvent('drag:move', {
        type: 'pointerMove',
        x: start.x,
        y: start.y,
      });
      await sendEvent('drag:down', {
        type: 'buttonDown',
        button: 1,
        x: start.x,
        y: start.y,
      });
      buttonPressed = true;

      for (let i = 1; i <= DRAG_STEPS; i++) {
        const ratio = i / DRAG_STEPS;
        current = {
          x: start.x + (end.x - start.x) * ratio,
          y: start.y + (end.y - start.y) * ratio,
        };
        await sendEvent('drag:move', {
          type: 'pointerMove',
          x: current.x,
          y: current.y,
        });
        await sleep(stepDelayMs);
      }
    } catch (error) {
      primaryError = error;
    } finally {
      try {
        if (buttonPressed) {
          await sendEvent('drag:up', {
            type: 'buttonUp',
            button: 1,
            x: current.x,
            y: current.y,
          });
        }
      } catch (error) {
        releaseError = error;
      } finally {
        if (session) {
          session.close();
          debug('Closed /control session for drag');
        }
      }
    }

    if (primaryError) throw primaryError;
    if (releaseError) throw releaseError;
  }

  private async pressKey(keyName: string): Promise<void> {
    const normalized = normalizeScreenRelayKey(keyName);
    await this.runInput(`key(${normalized})`, () =>
      this.client.key(normalized),
    );
  }

  private async insertText(value: string): Promise<void> {
    this.assertReady();

    // On backends without IME (e.g. Linux X11), codepoints > 0xff rely on
    // dynamic XChangeKeyboardMapping spare keysyms, which XKB/Chromium drops
    // silently without returning an HTTP error. Use clipboard paste + restore
    // when available, matching screen-relay's own guidance for non-layout text.
    const preferClipboard =
      containsNonLatin1(value) &&
      !this.capabilities?.ime &&
      Boolean(this.capabilities?.clipboard);

    if (!preferClipboard) {
      debug('Sending text via screen-relay type');
      try {
        await this.client.type(value);
        return;
      } catch (error) {
        if (
          !isRelayError(error) ||
          error.reason !== 'unsupported_input' ||
          !this.capabilities?.clipboard
        ) {
          throw formatScreenRelayError('type', error);
        }
      }
    }

    debug(
      'Sending text via clipboard paste (%s)',
      preferClipboard ? 'non-Latin-1 text without IME' : 'unsupported_input',
    );
    const pasteCombo = isMacBackend(this.capabilities?.backend)
      ? 'Meta+v'
      : 'Control+v';
    let previousClipboard: string | undefined;
    try {
      previousClipboard = await this.client.clipboard();
    } catch {
      previousClipboard = undefined;
    }

    try {
      await this.runInput('setClipboard', () =>
        this.client.setClipboard(value),
      );
      await this.runInput(`key(${pasteCombo})`, () =>
        this.client.key(pasteCombo),
      );
      await sleep(50);
    } finally {
      if (previousClipboard) {
        await this.client.setClipboard(previousClipboard).catch(() => {});
      }
    }
  }

  private async clearActiveInput(): Promise<void> {
    const selectAll = isMacBackend(this.capabilities?.backend)
      ? 'Meta+a'
      : 'Control+a';
    await this.runInput('clearInput', () =>
      this.client.key(selectAll, 'Backspace'),
    );
  }

  private async scrollScreen(param: ActionScrollParam): Promise<void> {
    const { width, height } = await this.size();
    const targetPoint = param.locate?.center
      ? { x: param.locate.center[0], y: param.locate.center[1] }
      : { x: width / 2, y: height / 2 };
    const { x, y } = await this.toNormalized(targetPoint);

    const isEdgeScroll =
      param.scrollType === 'scrollToTop' ||
      param.scrollType === 'scrollToBottom' ||
      param.scrollType === 'scrollToLeft' ||
      param.scrollType === 'scrollToRight';

    const notches = isEdgeScroll
      ? EDGE_SCROLL_NOTCHES
      : Math.max(
          1,
          Math.round(
            (param.distance ?? DEFAULT_SCROLL_DISTANCE_PX) /
              PIXELS_PER_WHEEL_NOTCH,
          ),
        );

    let dx = 0;
    let dy = 0;
    switch (param.scrollType) {
      case 'scrollToTop':
        dy = -notches;
        break;
      case 'scrollToBottom':
        dy = notches;
        break;
      case 'scrollToLeft':
        dx = -notches;
        break;
      case 'scrollToRight':
        dx = notches;
        break;
      default: {
        const direction = param.direction ?? 'down';
        if (direction === 'up') dy = -notches;
        else if (direction === 'down') dy = notches;
        else if (direction === 'left') dx = -notches;
        else if (direction === 'right') dx = notches;
        break;
      }
    }

    await this.runInput('scroll', () => this.client.scroll(x, y, { dx, dy }));
  }
}
