import assert from 'node:assert';
import {
  type DeviceAction,
  type InterfaceType,
  type LocateResultElement,
  type Point,
  type Size,
  getMidsceneLocationSchema,
  z,
} from '@midscene/core';
import {
  type AbstractInterface,
  type ActionTapParam,
  defineAction,
  defineActionClearInput,
  defineActionDoubleClick,
  defineActionDragAndDrop,
  defineActionHover,
  defineActionKeyboardPress,
  defineActionRightClick,
  defineActionScroll,
  defineActionTap,
} from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import screenshot from 'screenshot-desktop';

// Lazy load libnut with fallback
let libnut: any = null;
let libnutLoadError: Error | null = null;

async function getLibnut() {
  if (libnut) return libnut;
  if (libnutLoadError) throw libnutLoadError;

  try {
    // @ts-ignore - libnut types might not be available
    // Import from the internal module that has the actual libnut binding
    const libnutModule = await import(
      '@computer-use/libnut/dist/import_libnut'
    );
    libnut = libnutModule.libnut;
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

// Key name mapping for cross-platform compatibility
// Note: Modifier keys have different names when used as primary key vs modifier
const keyNameMap: Record<string, string> = {
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
const primaryKeyMap: Record<string, string> = {
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
  return keyNameMap[lowerKey] || lowerKey;
}

function normalizePrimaryKey(key: string): string {
  const lowerKey = key.toLowerCase();
  // First check primaryKeyMap for modifier keys pressed alone
  if (primaryKeyMap[lowerKey]) {
    return primaryKeyMap[lowerKey];
  }
  // Then use regular keyNameMap
  return keyNameMap[lowerKey] || lowerKey;
}

export interface DisplayInfo {
  id: string;
  name: string;
  primary?: boolean;
}

export interface ComputerDeviceOpt {
  displayId?: string; // Specify display ID
  customActions?: DeviceAction<any>[];
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
    return this.description || 'Computer Desktop Device';
  }

  /**
   * Get all available displays
   */
  static async listDisplays(): Promise<DisplayInfo[]> {
    try {
      const displays = await screenshot.listDisplays();
      return displays.map((d: any) => ({
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
Type: Computer Desktop
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
      const options: any = { format: 'png' };
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

  actionSpace(): DeviceAction<any>[] {
    const defaultActions = [
      // Tap (single click)
      defineActionTap(async (param: ActionTapParam) => {
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot tap');
        const [x, y] = element.center;
        libnut.moveMouse(Math.round(x), Math.round(y));
        libnut.mouseClick('left');
      }),

      // DoubleClick
      defineActionDoubleClick(async (param) => {
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot double click');
        const [x, y] = element.center;
        libnut.moveMouse(Math.round(x), Math.round(y));
        libnut.mouseClick('left', true); // double=true
      }),

      // RightClick
      defineActionRightClick(async (param) => {
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot right click');
        const [x, y] = element.center;
        libnut.moveMouse(Math.round(x), Math.round(y));
        libnut.mouseClick('right');
      }),

      // Hover
      defineActionHover(async (param) => {
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot hover');
        const [x, y] = element.center;
        libnut.moveMouse(Math.round(x), Math.round(y));
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

          if (element && param.mode !== 'append') {
            // Click and clear
            const [x, y] = element.center;
            libnut.moveMouse(Math.round(x), Math.round(y));
            libnut.mouseClick('left');
            await sleep(100);

            // Select all and delete
            const modifier =
              process.platform === 'darwin' ? 'command' : 'control';
            libnut.keyTap('a', [modifier]);
            libnut.keyTap('backspace');
          }

          if (param.mode === 'clear') {
            return;
          }

          if (!param.value) {
            return;
          }

          libnut.typeString(param.value);
        },
      }),

      // Scroll
      defineActionScroll(async (param) => {
        if (param.locate) {
          const element = param.locate as LocateResultElement;
          const [x, y] = element.center;
          libnut.moveMouse(Math.round(x), Math.round(y));
        }

        const scrollToEventName = param?.scrollType;

        if (scrollToEventName === 'scrollToTop') {
          // Scroll to top - multiple upward scrolls
          for (let i = 0; i < 10; i++) {
            libnut.scrollMouse(0, 10); // Scroll up
            await sleep(100);
          }
        } else if (scrollToEventName === 'scrollToBottom') {
          // Scroll to bottom - multiple downward scrolls
          for (let i = 0; i < 10; i++) {
            libnut.scrollMouse(0, -10); // Scroll down
            await sleep(100);
          }
        } else if (scrollToEventName === 'scrollToLeft') {
          // Scroll to left
          for (let i = 0; i < 10; i++) {
            libnut.scrollMouse(-10, 0);
            await sleep(100);
          }
        } else if (scrollToEventName === 'scrollToRight') {
          // Scroll to right
          for (let i = 0; i < 10; i++) {
            libnut.scrollMouse(10, 0);
            await sleep(100);
          }
        } else if (scrollToEventName === 'singleAction' || !scrollToEventName) {
          // Single scroll action
          const distance = param?.distance || 500;
          const ticks = Math.ceil(distance / 100);

          switch (param?.direction || 'down') {
            case 'up':
              libnut.scrollMouse(0, ticks);
              break;
            case 'down':
              libnut.scrollMouse(0, -ticks);
              break;
            case 'left':
              libnut.scrollMouse(-ticks, 0);
              break;
            case 'right':
              libnut.scrollMouse(ticks, 0);
              break;
          }
          await sleep(500);
        } else {
          throw new Error(
            `Unknown scroll event type: ${scrollToEventName}, param: ${JSON.stringify(param)}`,
          );
        }
      }),

      // KeyboardPress
      defineActionKeyboardPress(async (param) => {
        if (param.locate) {
          const [x, y] = param.locate.center;
          libnut.moveMouse(Math.round(x), Math.round(y));
          libnut.mouseClick('left');
          await sleep(50);
        }

        const keys = param.keyName.split('+');
        const modifiers = keys.slice(0, -1).map((k) => normalizeKeyName(k));
        // Use normalizePrimaryKey for the main key to handle modifier keys pressed alone
        const key = normalizePrimaryKey(keys[keys.length - 1]);

        debugDevice('KeyboardPress', {
          original: param.keyName,
          key,
          modifiers,
        });

        // keyTap supports array of modifiers
        if (modifiers.length > 0) {
          libnut.keyTap(key, modifiers);
        } else {
          libnut.keyTap(key);
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

        libnut.moveMouse(Math.round(fromX), Math.round(fromY));
        libnut.mouseToggle('down', 'left');
        await sleep(100);
        libnut.moveMouse(Math.round(toX), Math.round(toY));
        await sleep(100);
        libnut.mouseToggle('up', 'left');
      }),

      // ClearInput
      defineActionClearInput(async (param) => {
        const element = param.locate as LocateResultElement;
        assert(element, 'Element not found, cannot clear input');

        const [x, y] = element.center;
        libnut.moveMouse(Math.round(x), Math.round(y));
        libnut.mouseClick('left');
        await sleep(100);

        const modifier = process.platform === 'darwin' ? 'command' : 'control';
        libnut.keyTap('a', [modifier]);
        libnut.keyTap('backspace');
      }),
    ];

    const platformActions = Object.values(createPlatformActions(this));
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
const createPlatformActions = (_device: ComputerDevice) => {
  return {
    ListDisplays: defineAction({
      name: 'ListDisplays',
      description: 'List all available displays/monitors',
      call: async () => {
        return await ComputerDevice.listDisplays();
      },
    }),
  } as const;
};
