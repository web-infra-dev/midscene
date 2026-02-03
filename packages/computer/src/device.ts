import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
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
import screenshot from 'screenshot-desktop';

// Type definitions
interface LibNut {
  getScreenSize(): { width: number; height: number };
  getMousePos(): { x: number; y: number };
  moveMouse(x: number, y: number): void;
  mouseClick(button?: 'left' | 'right' | 'middle', double?: boolean): void;
  mouseToggle(state: 'up' | 'down', button?: 'left' | 'right' | 'middle'): void;
  scrollMouse(x: number, y: number): void;
  keyTap(key: string, modifiers?: string[]): void;
  typeString(text: string): void;
}

interface ScreenshotOptions {
  format: 'png' | 'jpg';
  screen?: string | number;
}

interface ScreenshotDisplay {
  id: string | number;
  name?: string;
  primary?: boolean;
}

// Constants
const SMOOTH_MOVE_STEPS_TAP = 8;
const SMOOTH_MOVE_STEPS_MOUSE_MOVE = 10;
const SMOOTH_MOVE_DELAY_TAP = 8;
const SMOOTH_MOVE_DELAY_MOUSE_MOVE = 10;
const MOUSE_MOVE_EFFECT_WAIT = 300;
const CLICK_HOLD_DURATION = 50;
const INPUT_FOCUS_DELAY = 300;
const INPUT_CLEAR_DELAY = 150;
const SCROLL_REPEAT_COUNT = 10;
const SCROLL_STEP_DELAY = 100;
const SCROLL_COMPLETE_DELAY = 500;

// Input strategy constants
const INPUT_STRATEGY_ALWAYS_CLIPBOARD = 'always-clipboard';
const INPUT_STRATEGY_CLIPBOARD_FOR_NON_ASCII = 'clipboard-for-non-ascii';

// macOS AppleScript key code mapping
// Reference: https://eastmanreference.com/complete-list-of-applescript-key-codes
const APPLESCRIPT_KEY_CODE_MAP: Record<string, number> = {
  // Special keys
  return: 36,
  enter: 36,
  tab: 48,
  space: 49,
  backspace: 51,
  delete: 51,
  escape: 53,
  forwarddelete: 117,

  // Arrow keys
  left: 123,
  right: 124,
  down: 125,
  up: 126,

  // Navigation keys
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,

  // Function keys
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
};

// Modifier key mapping for AppleScript
const APPLESCRIPT_MODIFIER_MAP: Record<string, string> = {
  command: 'command down',
  cmd: 'command down',
  control: 'control down',
  ctrl: 'control down',
  shift: 'shift down',
  alt: 'option down',
  option: 'option down',
  meta: 'command down',
};

/**
 * Send a key press using AppleScript (macOS only)
 * More reliable than libnut for TUI applications like Bubble Tea
 */
function sendKeyViaAppleScript(key: string, modifiers: string[] = []): void {
  const lowerKey = key.toLowerCase();
  const keyCode = APPLESCRIPT_KEY_CODE_MAP[lowerKey];

  // Build modifier string
  const modifierParts = modifiers
    .map((m) => APPLESCRIPT_MODIFIER_MAP[m.toLowerCase()])
    .filter(Boolean);
  const modifierStr =
    modifierParts.length > 0 ? ` using {${modifierParts.join(', ')}}` : '';

  let script: string;

  if (keyCode !== undefined) {
    // Use key code for special keys
    script = `tell application "System Events" to key code ${keyCode}${modifierStr}`;
  } else if (lowerKey.length === 1) {
    // Use keystroke for single characters (letters, numbers, symbols)
    script = `tell application "System Events" to keystroke "${key}"${modifierStr}`;
  } else {
    // Fallback: try as keystroke
    script = `tell application "System Events" to keystroke "${key}"${modifierStr}`;
  }

  debugDevice('sendKeyViaAppleScript', { key, modifiers, script });
  execSync(`osascript -e '${script}'`);
}

// Lazy load libnut with fallback
let libnut: LibNut | null = null;
let libnutLoadError: Error | null = null;

async function getLibnut(): Promise<LibNut> {
  if (libnut) return libnut;
  if (libnutLoadError) throw libnutLoadError;

  try {
    const require = createRequire(import.meta.url);
    const libnutModule = require('@computer-use/libnut/dist/import_libnut');
    libnut = libnutModule.libnut as LibNut;
    if (!libnut) {
      throw new Error('libnut module loaded but libnut object is undefined');
    }
    return libnut;
  } catch (error) {
    libnutLoadError = error as Error;
    throw new Error(
      `Failed to load @computer-use/libnut. Make sure it is properly installed and compiled for your platform. Error: ${error}`,
    );
  }
}

const debugDevice = getDebug('computer:device');

/**
 * Smooth mouse movement to trigger mousemove events
 */
async function smoothMoveMouse(
  targetX: number,
  targetY: number,
  steps: number,
  stepDelay: number,
): Promise<void> {
  assert(libnut, 'libnut not initialized');
  const currentPos = libnut.getMousePos();
  for (let i = 1; i <= steps; i++) {
    const stepX = Math.round(
      currentPos.x + ((targetX - currentPos.x) * i) / steps,
    );
    const stepY = Math.round(
      currentPos.y + ((targetY - currentPos.y) * i) / steps,
    );
    libnut.moveMouse(stepX, stepY);
    await sleep(stepDelay);
  }
}

// Key name mapping for cross-platform compatibility
// Note: Modifier keys have different names when used as primary key vs modifier
const KEY_NAME_MAP: Record<string, string> = {
  // Modifier keys (for use in modifiers array)
  windows: 'win',
  win: 'win',
  ctrl: 'control',
  esc: 'escape',
  del: 'delete',
  ins: 'insert',
  // Navigation keys
  pgup: 'pageup',
  pgdn: 'pagedown',
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  // Media keys
  volumedown: 'audio_vol_down',
  volumeup: 'audio_vol_up',
  mediavolumedown: 'audio_vol_down',
  mediavolumeup: 'audio_vol_up',
  mute: 'audio_mute',
  mediamute: 'audio_mute',
  mediaplay: 'audio_play',
  mediapause: 'audio_pause',
  mediaplaypause: 'audio_play',
  mediastop: 'audio_stop',
  medianexttrack: 'audio_next',
  mediaprevioustrack: 'audio_prev',
  medianext: 'audio_next',
  mediaprev: 'audio_prev',
};

// When pressing modifier keys alone (as primary key), use these names
// This is needed because libnut requires different key names for modifiers
// when they are the main key vs when they are in the modifiers array
const PRIMARY_KEY_MAP: Record<string, string> = {
  command: 'cmd',
  cmd: 'cmd',
  meta: 'meta',
  control: 'control',
  ctrl: 'control',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
};

function normalizeKeyName(key: string): string {
  const lowerKey = key.toLowerCase();
  return KEY_NAME_MAP[lowerKey] || lowerKey;
}

function normalizePrimaryKey(key: string): string {
  const lowerKey = key.toLowerCase();
  // First check PRIMARY_KEY_MAP for modifier keys pressed alone
  if (PRIMARY_KEY_MAP[lowerKey]) {
    return PRIMARY_KEY_MAP[lowerKey];
  }
  // Then use regular KEY_NAME_MAP
  return KEY_NAME_MAP[lowerKey] || lowerKey;
}

export interface DisplayInfo {
  id: string;
  name: string;
  primary?: boolean;
}

export interface ComputerDeviceOpt {
  displayId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customActions?: DeviceAction<any>[];
  inputStrategy?: 'always-clipboard' | 'clipboard-for-non-ascii';
  /**
   * Keyboard driver for sending key events (macOS only)
   * - 'applescript': Use AppleScript via osascript (default on macOS, more reliable)
   * - 'libnut': Use libnut's keyTap (faster but may not work with some TUI apps)
   */
  keyboardDriver?: 'applescript' | 'libnut';
}

export class ComputerDevice implements AbstractInterface {
  interfaceType: InterfaceType = 'computer';
  private options?: ComputerDeviceOpt;
  private displayId?: string;
  private description?: string;
  private destroyed = false;
  uri?: string;

  constructor(options?: ComputerDeviceOpt) {
    this.options = options;
    this.displayId = options?.displayId;
  }

  describe(): string {
    return this.description || 'Computer Device';
  }

  /**
   * Get all available displays
   */
  static async listDisplays(): Promise<DisplayInfo[]> {
    try {
      const displays: ScreenshotDisplay[] = await screenshot.listDisplays();
      return displays.map((d) => ({
        id: String(d.id),
        name: d.name || `Display ${d.id}`,
        primary: d.primary || false,
      }));
    } catch (error) {
      debugDevice(`Failed to list displays: ${error}`);
      return [];
    }
  }

  async connect(): Promise<void> {
    debugDevice('Connecting to computer device');

    try {
      // Load libnut on first connect
      libnut = await getLibnut();

      const size = await this.size();
      const displays = await ComputerDevice.listDisplays();

      this.description = `
Type: Computer
Platform: ${process.platform}
Display: ${this.displayId || 'Primary'}
Screen Size: ${size.width}x${size.height}
Available Displays: ${displays.length > 0 ? displays.map((d) => d.name).join(', ') : 'Unknown'}
`;
      debugDevice('Computer device connected', this.description);
    } catch (error) {
      debugDevice(`Failed to connect: ${error}`);
      throw new Error(`Unable to connect to computer device: ${error}`);
    }
  }

  async screenshotBase64(): Promise<string> {
    debugDevice('Taking screenshot', { displayId: this.displayId });

    try {
      const options: ScreenshotOptions = { format: 'png' };
      if (this.displayId !== undefined) {
        // On macOS: displayId is numeric (CGDirectDisplayID)
        // On Windows: displayId is string like "\\.\DISPLAY1"
        // On Linux: displayId is string like ":0.0"
        if (process.platform === 'darwin') {
          const screenIndex = Number(this.displayId);
          if (!Number.isNaN(screenIndex)) {
            options.screen = screenIndex;
          }
        } else {
          // Windows and Linux use string IDs directly
          options.screen = this.displayId;
        }
      }

      debugDevice('Screenshot options', options);
      const buffer: Buffer = await screenshot(options);
      return createImgBase64ByFormat('png', buffer.toString('base64'));
    } catch (error) {
      debugDevice(`Screenshot failed: ${error}`);
      throw new Error(`Failed to take screenshot: ${error}`);
    }
  }

  async size(): Promise<Size> {
    assert(libnut, 'libnut not initialized');
    try {
      const screenSize = libnut.getScreenSize();
      return {
        width: screenSize.width,
        height: screenSize.height,
        dpr: 1, // Desktop typically uses logical pixels
      };
    } catch (error) {
      debugDevice(`Failed to get screen size: ${error}`);
      throw new Error(`Failed to get screen size: ${error}`);
    }
  }

  /**
   * Check if text contains non-ASCII characters
   * Matches: Chinese, Japanese, Korean, Latin extended characters (café, niño), emoji, etc.
   */
  private shouldUseClipboardForText(text: string): boolean {
    // Check for any character with code point >= 128 (non-ASCII)
    const hasNonAscii = /[\x80-\uFFFF]/.test(text);
    return hasNonAscii;
  }

  /**
   * Type text via clipboard (paste)
   * This method:
   * 1. Saves the old clipboard content
   * 2. Writes new content to clipboard
   * 3. Simulates paste shortcut (Ctrl+V / Cmd+V)
   * 4. Restores old clipboard content
   */
  private async typeViaClipboard(text: string): Promise<void> {
    assert(libnut, 'libnut not initialized');
    debugDevice('Using clipboard to input text', {
      textLength: text.length,
      preview: text.substring(0, 20),
    });

    const clipboardy = await import('clipboardy');
    // 1. Save old clipboard content
    const oldClipboard = await clipboardy.default.read().catch(() => '');

    try {
      // 2. Write new content to clipboard
      await clipboardy.default.write(text);
      await sleep(50);

      // 3. Simulate paste shortcut
      const modifier = process.platform === 'darwin' ? 'command' : 'control';
      libnut.keyTap('v', [modifier]);
      await sleep(100);
    } finally {
      // 4. Restore old clipboard content
      if (oldClipboard) {
        await clipboardy.default.write(oldClipboard).catch(() => {
          // Silent fail - don't affect main flow
          debugDevice('Failed to restore clipboard content');
        });
      }
    }
  }

  /**
   * Smart type string with platform-specific strategy
   * - macOS: Always use libnut (native support for non-ASCII)
   * - Windows/Linux: Use clipboard for non-ASCII characters
   */
  private async smartTypeString(text: string): Promise<void> {
    assert(libnut, 'libnut not initialized');

    // macOS: use libnut directly (native Chinese support)
    if (process.platform === 'darwin') {
      libnut.typeString(text);
      return;
    }

    // Windows/Linux: use smart strategy
    const inputStrategy =
      this.options?.inputStrategy ?? INPUT_STRATEGY_CLIPBOARD_FOR_NON_ASCII;

    if (inputStrategy === INPUT_STRATEGY_ALWAYS_CLIPBOARD) {
      await this.typeViaClipboard(text);
      return;
    }

    // clipboard-for-non-ascii strategy: intelligent detection
    const shouldUseClipboard = this.shouldUseClipboardForText(text);

    if (shouldUseClipboard) {
      await this.typeViaClipboard(text);
    } else {
      libnut.typeString(text);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actionSpace(): DeviceAction<any>[] {
    const defaultActions: DeviceAction<any>[] = [
      // Tap (single click)
      defineActionTap(async (param: ActionTapParam) => {
        assert(libnut, 'libnut not initialized');
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot tap');
        const [x, y] = element.center;
        const targetX = Math.round(x);
        const targetY = Math.round(y);

        await smoothMoveMouse(
          targetX,
          targetY,
          SMOOTH_MOVE_STEPS_TAP,
          SMOOTH_MOVE_DELAY_TAP,
        );
        // Use mouseToggle for more realistic click behavior
        libnut.mouseToggle('down', 'left');
        await sleep(CLICK_HOLD_DURATION);
        libnut.mouseToggle('up', 'left');
      }),

      // DoubleClick
      defineActionDoubleClick(async (param) => {
        assert(libnut, 'libnut not initialized');
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot double click');
        const [x, y] = element.center;
        libnut.moveMouse(Math.round(x), Math.round(y));
        libnut.mouseClick('left', true);
      }),

      // RightClick
      defineActionRightClick(async (param) => {
        assert(libnut, 'libnut not initialized');
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot right click');
        const [x, y] = element.center;
        libnut.moveMouse(Math.round(x), Math.round(y));
        libnut.mouseClick('right');
      }),

      // MouseMove
      defineAction<typeof actionHoverParamSchema, ActionHoverParam>({
        name: 'MouseMove',
        description: 'Move the mouse to the element',
        interfaceAlias: 'aiHover',
        paramSchema: actionHoverParamSchema,
        call: async (param) => {
          assert(libnut, 'libnut not initialized');
          const element = param.locate as LocateResultElement;
          assert(element, 'Element not found, cannot move mouse');
          const [x, y] = element.center;
          const targetX = Math.round(x);
          const targetY = Math.round(y);

          await smoothMoveMouse(
            targetX,
            targetY,
            SMOOTH_MOVE_STEPS_MOUSE_MOVE,
            SMOOTH_MOVE_DELAY_MOUSE_MOVE,
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
          assert(libnut, 'libnut not initialized');
          const element = param.locate as LocateResultElement | undefined;

          if (element && param.mode !== 'append') {
            // Click and clear
            const [x, y] = element.center;
            libnut.moveMouse(Math.round(x), Math.round(y));
            libnut.mouseClick('left');
            await sleep(INPUT_FOCUS_DELAY);

            // Select all and delete
            const modifier =
              process.platform === 'darwin' ? 'command' : 'control';
            libnut.keyTap('a', [modifier]);
            await sleep(50);
            libnut.keyTap('backspace');
            await sleep(INPUT_CLEAR_DELAY);
          }

          if (param.mode === 'clear') {
            return;
          }

          if (!param.value) {
            return;
          }

          await this.smartTypeString(param.value);
        },
      }),

      // Scroll
      defineActionScroll(async (param) => {
        assert(libnut, 'libnut not initialized');

        if (param.locate) {
          const element = param.locate as LocateResultElement;
          const [x, y] = element.center;
          libnut.moveMouse(Math.round(x), Math.round(y));
        }

        const scrollType = param?.scrollType;

        // Scroll to edge actions
        const scrollToEdgeActions: Record<string, [number, number]> = {
          scrollToTop: [0, 10],
          scrollToBottom: [0, -10],
          scrollToLeft: [-10, 0],
          scrollToRight: [10, 0],
        };

        const edgeAction = scrollToEdgeActions[scrollType || ''];
        if (edgeAction) {
          const [dx, dy] = edgeAction;
          for (let i = 0; i < SCROLL_REPEAT_COUNT; i++) {
            libnut.scrollMouse(dx, dy);
            await sleep(SCROLL_STEP_DELAY);
          }
          return;
        }

        // Single scroll action
        if (scrollType === 'singleAction' || !scrollType) {
          const distance = param?.distance || 500;
          const ticks = Math.ceil(distance / 100);
          const direction = param?.direction || 'down';

          const directionMap: Record<string, [number, number]> = {
            up: [0, ticks],
            down: [0, -ticks],
            left: [-ticks, 0],
            right: [ticks, 0],
          };

          const [dx, dy] = directionMap[direction] || [0, -ticks];
          libnut.scrollMouse(dx, dy);
          await sleep(SCROLL_COMPLETE_DELAY);
          return;
        }

        throw new Error(
          `Unknown scroll type: ${scrollType}, param: ${JSON.stringify(param)}`,
        );
      }),

      // KeyboardPress
      defineActionKeyboardPress(async (param) => {
        assert(libnut, 'libnut not initialized');

        if (param.locate) {
          const [x, y] = param.locate.center;
          libnut.moveMouse(Math.round(x), Math.round(y));
          libnut.mouseClick('left');
          await sleep(50);
        }

        const keys = param.keyName.split('+');
        const modifiers = keys.slice(0, -1).map(normalizeKeyName);
        // Use normalizePrimaryKey for the main key to handle modifier keys pressed alone
        const key = normalizePrimaryKey(keys[keys.length - 1]);

        // On macOS, use AppleScript by default (more reliable for TUI apps)
        // User can opt-out by setting keyboardDriver: 'libnut'
        const useAppleScript =
          process.platform === 'darwin' &&
          this.options?.keyboardDriver !== 'libnut';

        debugDevice('KeyboardPress', {
          original: param.keyName,
          key,
          modifiers,
          driver: useAppleScript ? 'applescript' : 'libnut',
        });

        if (useAppleScript) {
          // Use AppleScript for all keys on macOS when keyboardDriver is 'applescript'
          sendKeyViaAppleScript(key, modifiers);
        } else {
          // Use libnut (default)
          if (modifiers.length > 0) {
            libnut.keyTap(key, modifiers);
          } else {
            libnut.keyTap(key);
          }
        }
      }),

      // DragAndDrop
      defineActionDragAndDrop(async (param) => {
        assert(libnut, 'libnut not initialized');
        const from = param.from as LocateResultElement;
        const to = param.to as LocateResultElement;
        assert(from, 'missing "from" param for drag and drop');
        assert(to, 'missing "to" param for drag and drop');

        const [fromX, fromY] = from.center;
        const [toX, toY] = to.center;

        libnut.moveMouse(Math.round(fromX), Math.round(fromY));
        libnut.mouseToggle('down', 'left');
        await sleep(100);
        libnut.moveMouse(Math.round(toX), Math.round(toY));
        await sleep(100);
        libnut.mouseToggle('up', 'left');
      }),

      // ClearInput
      defineActionClearInput(async (param) => {
        assert(libnut, 'libnut not initialized');
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot clear input');

        const [x, y] = element.center;
        libnut.moveMouse(Math.round(x), Math.round(y));
        libnut.mouseClick('left');
        await sleep(100);

        const modifier = process.platform === 'darwin' ? 'command' : 'control';
        libnut.keyTap('a', [modifier]);
        libnut.keyTap('backspace');
        await sleep(50);
      }),
    ];

    const platformActions = Object.values(createPlatformActions());
    const customActions = this.options?.customActions || [];

    return [...defaultActions, ...platformActions, ...customActions];
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    debugDevice('Computer device destroyed');
  }

  async url(): Promise<string> {
    return '';
  }
}

/**
 * Platform-specific actions
 */
function createPlatformActions() {
  return {
    ListDisplays: defineAction({
      name: 'ListDisplays',
      description: 'List all available displays/monitors',
      call: async () => {
        return await ComputerDevice.listDisplays();
      },
    }),
  } as const;
}
