import type { Point } from '@midscene/core';
import { z } from '@midscene/core';
import {
  AbstractInterface,
  type BrowserInputPrimitives,
  type DeviceAction,
  defineAction,
  defineActionsFromInputPrimitives,
} from '@midscene/core/device';

import { sleep } from '@midscene/core/utils';
import type { ElementInfo } from '@midscene/shared/extractor';
import { transformHotkeyInput } from '@midscene/shared/us-keyboard-layout';

const navigateParamSchema = z.object({
  url: z
    .string()
    .describe(
      'The URL to navigate to. Must start with https://, file://, or a similar protocol.',
    ),
});

function normalizeKeyInputs(value: string | string[]): string[] {
  const inputs = Array.isArray(value) ? value : [value];
  const result: string[] = [];

  for (const input of inputs) {
    if (typeof input !== 'string') {
      result.push(input as unknown as string);
      continue;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      result.push(input);
      continue;
    }

    let normalized = trimmed;
    if (normalized.length > 1 && normalized.includes('+')) {
      normalized = normalized.replace(/\s*\+\s*/g, ' ');
    }
    if (/\s/.test(normalized)) {
      normalized = normalized.replace(/\s+/g, ' ');
    }

    const transformed = transformHotkeyInput(normalized);
    if (transformed.length === 1 && transformed[0] === '' && trimmed !== '') {
      result.push(input);
      continue;
    }
    if (transformed.length === 0) {
      result.push(input);
      continue;
    }

    result.push(...transformed);
  }

  return result;
}

export function getKeyCommands(
  value: string | string[],
): Array<{ key: string; command?: string }> {
  const keys = normalizeKeyInputs(value);

  return keys.reduce((acc: Array<{ key: string; command?: string }>, k) => {
    const includeMeta = keys.includes('Meta') || keys.includes('Control');
    if (includeMeta && (k === 'a' || k === 'A')) {
      return acc.concat([{ key: k, command: 'SelectAll' }]);
    }
    if (includeMeta && (k === 'c' || k === 'C')) {
      return acc.concat([{ key: k, command: 'Copy' }]);
    }
    if (includeMeta && (k === 'v' || k === 'V')) {
      return acc.concat([{ key: k, command: 'Paste' }]);
    }
    return acc.concat([{ key: k }]);
  }, []);
}

// this is copied from puppeteer, but we don't want to import puppeteer here
export declare type KeyInput =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'Power'
  | 'Eject'
  | 'Abort'
  | 'Help'
  | 'Backspace'
  | 'Tab'
  | 'Numpad5'
  | 'NumpadEnter'
  | 'Enter'
  | '\r'
  | '\n'
  | 'ShiftLeft'
  | 'ShiftRight'
  | 'ControlLeft'
  | 'ControlRight'
  | 'AltLeft'
  | 'AltRight'
  | 'Pause'
  | 'CapsLock'
  | 'Escape'
  | 'Convert'
  | 'NonConvert'
  | 'Space'
  | 'Numpad9'
  | 'PageUp'
  | 'Numpad3'
  | 'PageDown'
  | 'End'
  | 'Numpad1'
  | 'Home'
  | 'Numpad7'
  | 'ArrowLeft'
  | 'Numpad4'
  | 'Numpad8'
  | 'ArrowUp'
  | 'ArrowRight'
  | 'Numpad6'
  | 'Numpad2'
  | 'ArrowDown'
  | 'Select'
  | 'Open'
  | 'PrintScreen'
  | 'Insert'
  | 'Numpad0'
  | 'Delete'
  | 'NumpadDecimal'
  | 'Digit0'
  | 'Digit1'
  | 'Digit2'
  | 'Digit3'
  | 'Digit4'
  | 'Digit5'
  | 'Digit6'
  | 'Digit7'
  | 'Digit8'
  | 'Digit9'
  | 'KeyA'
  | 'KeyB'
  | 'KeyC'
  | 'KeyD'
  | 'KeyE'
  | 'KeyF'
  | 'KeyG'
  | 'KeyH'
  | 'KeyI'
  | 'KeyJ'
  | 'KeyK'
  | 'KeyL'
  | 'KeyM'
  | 'KeyN'
  | 'KeyO'
  | 'KeyP'
  | 'KeyQ'
  | 'KeyR'
  | 'KeyS'
  | 'KeyT'
  | 'KeyU'
  | 'KeyV'
  | 'KeyW'
  | 'KeyX'
  | 'KeyY'
  | 'KeyZ'
  | 'MetaLeft'
  | 'MetaRight'
  | 'ContextMenu'
  | 'NumpadMultiply'
  | 'NumpadAdd'
  | 'NumpadSubtract'
  | 'NumpadDivide'
  | 'F1'
  | 'F2'
  | 'F3'
  | 'F4'
  | 'F5'
  | 'F6'
  | 'F7'
  | 'F8'
  | 'F9'
  | 'F10'
  | 'F11'
  | 'F12'
  | 'F13'
  | 'F14'
  | 'F15'
  | 'F16'
  | 'F17'
  | 'F18'
  | 'F19'
  | 'F20'
  | 'F21'
  | 'F22'
  | 'F23'
  | 'F24'
  | 'NumLock'
  | 'ScrollLock'
  | 'AudioVolumeMute'
  | 'AudioVolumeDown'
  | 'AudioVolumeUp'
  | 'MediaTrackNext'
  | 'MediaTrackPrevious'
  | 'MediaStop'
  | 'MediaPlayPause'
  | 'Semicolon'
  | 'Equal'
  | 'NumpadEqual'
  | 'Comma'
  | 'Minus'
  | 'Period'
  | 'Slash'
  | 'Backquote'
  | 'BracketLeft'
  | 'Backslash'
  | 'BracketRight'
  | 'Quote'
  | 'AltGraph'
  | 'Props'
  | 'Cancel'
  | 'Clear'
  | 'Shift'
  | 'Control'
  | 'Alt'
  | 'Accept'
  | 'ModeChange'
  | ' '
  | 'Print'
  | 'Execute'
  | '\u0000'
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z'
  | 'Meta'
  | '*'
  | '+'
  | '-'
  | '/'
  | ';'
  | '='
  | ','
  | '.'
  | '`'
  | '['
  | '\\'
  | ']'
  | "'"
  | 'Attn'
  | 'CrSel'
  | 'ExSel'
  | 'EraseEof'
  | 'Play'
  | 'ZoomOut'
  | ')'
  | '!'
  | '@'
  | '#'
  | '$'
  | '%'
  | '^'
  | '&'
  | '('
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S'
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'Z'
  | ':'
  | '<'
  | '_'
  | '>'
  | '?'
  | '~'
  | '{'
  | '|'
  | '}'
  | '"'
  | 'SoftLeft'
  | 'SoftRight'
  | 'Camera'
  | 'Call'
  | 'EndCall'
  | 'VolumeDown'
  | 'VolumeUp';

export type MouseButton = 'left' | 'right' | 'middle';

export interface MouseAction {
  click: (
    x: number,
    y: number,
    options: { button: MouseButton; count?: number },
  ) => Promise<void>;
  wheel: (deltaX: number, deltaY: number) => Promise<void>;
  move: (x: number, y: number) => Promise<void>;
  drag: (
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => Promise<void>;
}

export interface KeyboardAction {
  type: (text: string) => Promise<void>;
  press: (
    action:
      | { key: KeyInput; command?: string }
      | { key: KeyInput; command?: string }[],
  ) => Promise<void>;
}

export interface ChromePageDestroyOptions {
  closeTab?: boolean; // should close the tab when the page object is destroyed
}

export abstract class AbstractWebPage extends AbstractInterface {
  navigate?(url: string): Promise<void>;
  reload?(): Promise<void>;
  goBack?(): Promise<void>;
  goForward?(): Promise<void>;
  stopLoading?(): Promise<void>;
  navigationState?(): Promise<{ isLoading: boolean }>;
  flushPendingVisualUpdate?(): Promise<void>;

  get mouse(): MouseAction {
    return {
      click: async (
        x: number,
        y: number,
        options: { button: MouseButton },
      ) => {},
      wheel: async (deltaX: number, deltaY: number) => {},
      move: async (x: number, y: number) => {},
      drag: async (
        from: { x: number; y: number },
        to: { x: number; y: number },
      ) => {},
    };
  }

  get keyboard(): KeyboardAction {
    return {
      type: async (text: string) => {},
      press: async (
        action:
          | { key: KeyInput; command?: string }
          | { key: KeyInput; command?: string }[],
      ) => {},
    };
  }

  async clearInput(element?: ElementInfo): Promise<void> {}

  abstract scrollUntilTop(startingPoint?: Point): Promise<void>;
  abstract scrollUntilBottom(startingPoint?: Point): Promise<void>;
  abstract scrollUntilLeft(startingPoint?: Point): Promise<void>;
  abstract scrollUntilRight(startingPoint?: Point): Promise<void>;
  abstract scrollUp(distance?: number, startingPoint?: Point): Promise<void>;
  abstract scrollDown(distance?: number, startingPoint?: Point): Promise<void>;
  abstract scrollLeft(distance?: number, startingPoint?: Point): Promise<void>;
  abstract scrollRight(distance?: number, startingPoint?: Point): Promise<void>;
  abstract longPress(x: number, y: number, duration?: number): Promise<void>;
  abstract swipe(
    from: { x: number; y: number },
    to: { x: number; y: number },
    duration?: number,
  ): Promise<void>;
  abstract pinch(
    centerX: number,
    centerY: number,
    startDistance: number,
    endDistance: number,
    duration?: number,
  ): Promise<void>;
}

export function createWebInputPrimitives(
  page: AbstractWebPage,
): BrowserInputPrimitives {
  return {
    pointer: {
      tap: async ({ x, y }) => {
        await page.mouse.click(x, y, { button: 'left' });
      },
      rightClick: async ({ x, y }) => {
        await page.mouse.click(x, y, { button: 'right' });
      },
      doubleClick: async ({ x, y }) => {
        await page.mouse.click(x, y, { button: 'left', count: 2 });
      },
      hover: async ({ x, y }) => {
        await page.mouse.move(x, y);
      },
      dragAndDrop: async (from, to) => {
        await page.mouse.drag(from, to);
      },
      longPress: async ({ x, y }, opts) => {
        await page.longPress(x, y, opts?.duration);
      },
    },
    keyboard: {
      typeText: async (value, opts) => {
        const element = opts?.target;
        if (element && opts?.replace !== false) {
          await page.clearInput(element as ElementInfo);
        } else if (element) {
          const target = element as ElementInfo;
          await page.mouse.click(target.center[0], target.center[1], {
            button: 'left',
          });
          await page.keyboard.press([{ key: 'End' }]);
        }

        if (opts?.focusOnly) {
          return;
        }

        await page.keyboard.type(value);
        await page.flushPendingVisualUpdate?.();
      },
      keyboardPress: async (keyName, opts) => {
        const element = opts?.target as
          | { center: [number, number] }
          | undefined;
        if (element) {
          await page.mouse.click(element.center[0], element.center[1], {
            button: 'left',
          });
        }

        const keys = getKeyCommands(keyName);
        await page.keyboard.press(keys as any);
        await page.flushPendingVisualUpdate?.();
      },
      cursorMove: async (direction, times = 1) => {
        const arrowKey = direction === 'left' ? 'ArrowLeft' : 'ArrowRight';
        for (let i = 0; i < times; i++) {
          await page.keyboard.press([{ key: arrowKey as any }]);
          await sleep(100);
        }
      },
      clearInput: async (target) => {
        await page.clearInput(target as ElementInfo | undefined);
      },
    },
    touch: {
      pinch: async ({ x, y }, opts) => {
        await page.pinch(
          x,
          y,
          opts.startDistance,
          opts.endDistance,
          opts.duration,
        );
      },
      swipe: async (from, to, opts) => {
        await page.swipe(from, to, opts?.duration);
      },
    },
    scroll: {
      scroll: async (param) => {
        const element = param.locate;
        const startingPoint = element
          ? {
              left: element.center[0],
              top: element.center[1],
            }
          : undefined;
        const scrollToEventName = param?.scrollType;
        if (scrollToEventName === 'scrollToTop') {
          await page.scrollUntilTop(startingPoint);
        } else if (scrollToEventName === 'scrollToBottom') {
          await page.scrollUntilBottom(startingPoint);
        } else if (scrollToEventName === 'scrollToRight') {
          await page.scrollUntilRight(startingPoint);
        } else if (scrollToEventName === 'scrollToLeft') {
          await page.scrollUntilLeft(startingPoint);
        } else if (scrollToEventName === 'singleAction' || !scrollToEventName) {
          if (param?.direction === 'down' || !param || !param.direction) {
            await page.scrollDown(param?.distance || undefined, startingPoint);
          } else if (param.direction === 'up') {
            await page.scrollUp(param.distance || undefined, startingPoint);
          } else if (param.direction === 'left') {
            await page.scrollLeft(param.distance || undefined, startingPoint);
          } else if (param.direction === 'right') {
            await page.scrollRight(param.distance || undefined, startingPoint);
          } else {
            throw new Error(`Unknown scroll direction: ${param.direction}`);
          }
          await sleep(500);
        } else {
          throw new Error(
            `Unknown scroll event type: ${scrollToEventName}, param: ${JSON.stringify(
              param,
            )}`,
          );
        }
      },
    },
  };
}

export const commonWebActionsForWebPage = <T extends AbstractWebPage>(
  page: T,
  includeTouchEvents = false,
): DeviceAction<any>[] => {
  const input = createWebInputPrimitives(page);
  return [
    ...defineActionsFromInputPrimitives(input, {
      size: () => page.size(),
      includeSwipe: includeTouchEvents,
    }),

    defineAction<typeof navigateParamSchema, { url: string }>({
      name: 'Navigate',
      description:
        'Navigate the browser to a specified URL. Opens the URL in the current tab.',
      paramSchema: navigateParamSchema,
      sample: {
        url: 'https://www.example.com',
      },
      call: async (param) => {
        if (!page.navigate) {
          throw new Error(
            'Navigate operation is not supported on this page type',
          );
        }
        await page.navigate(param.url);
      },
    }),

    defineAction({
      name: 'Reload',
      description: 'Reload the current page',
      call: async () => {
        if (!page.reload) {
          throw new Error(
            'Reload operation is not supported on this page type',
          );
        }
        await page.reload();
      },
    }),

    defineAction({
      name: 'GoBack',
      description: 'Navigate back in browser history',
      call: async () => {
        if (!page.goBack) {
          throw new Error(
            'GoBack operation is not supported on this page type',
          );
        }
        await page.goBack();
      },
    }),
    defineAction({
      name: 'GoForward',
      description: 'Navigate forward in browser history',
      call: async () => {
        if (!page.goForward) {
          throw new Error(
            'GoForward operation is not supported on this page type',
          );
        }
        await page.goForward();
      },
    }),
  ];
};
