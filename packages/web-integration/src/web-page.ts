import assert from 'node:assert';
import type { Point } from '@midscene/core';
import {
  AbstractInterface,
  type DeviceAction,
  defineActionClearInput,
  defineActionDoubleClick,
  defineActionDragAndDrop,
  defineActionHover,
  defineActionInput,
  defineActionKeyboardPress,
  defineActionLongPress,
  defineActionRightClick,
  defineActionScroll,
  defineActionSwipe,
  defineActionTap,
} from '@midscene/core/device';

import { sleep } from '@midscene/core/utils';
import type { ElementInfo } from '@midscene/shared/extractor';
import { getDebug } from '@midscene/shared/logger';
import { transformHotkeyInput } from '@midscene/shared/us-keyboard-layout';

const debug = getDebug('web:page');

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

  async clearInput(element: ElementInfo): Promise<void> {}

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
}

export const commonWebActionsForWebPage = <T extends AbstractWebPage>(
  page: T,
): DeviceAction<any>[] => [
  defineActionTap(async (param) => {
    const element = param.locate;
    assert(element, 'Element not found, cannot tap');
    await page.mouse.click(element.center[0], element.center[1], {
      button: 'left',
    });
  }),
  defineActionRightClick(async (param) => {
    const element = param.locate;
    assert(element, 'Element not found, cannot right click');
    await page.mouse.click(element.center[0], element.center[1], {
      button: 'right',
    });
  }),
  defineActionDoubleClick(async (param) => {
    const element = param.locate;
    assert(element, 'Element not found, cannot double click');

    await page.mouse.click(element.center[0], element.center[1], {
      button: 'left',
      count: 2,
    });
  }),
  defineActionHover(async (param) => {
    const element = param.locate;
    assert(element, 'Element not found, cannot hover');
    await page.mouse.move(element.center[0], element.center[1]);
  }),
  defineActionInput(async (param) => {
    const element = param.locate;
    if (element) {
      // Only clear input if mode is not 'append' (clear and replace both clear the field)
      if (param.mode !== 'append') {
        await page.clearInput(element as unknown as ElementInfo);
      }

      if (!param || !param.value) {
        return;
      }
    }

    // Note: there is another implementation in AndroidDevicePage, which is more complex
    await page.keyboard.type(param.value);
  }),
  defineActionKeyboardPress(async (param) => {
    const element = param.locate;
    if (element) {
      await page.mouse.click(element.center[0], element.center[1], {
        button: 'left',
      });
    }

    const keys = getKeyCommands(param.keyName);
    await page.keyboard.press(keys as any); // TODO: fix this type error
  }),
  defineActionScroll(async (param) => {
    const element = param.locate;
    const startingPoint = element
      ? {
          left: element.center[0],
          top: element.center[1],
        }
      : undefined;
    const scrollToEventName = param?.scrollType;
    if (scrollToEventName === 'untilTop') {
      await page.scrollUntilTop(startingPoint);
    } else if (scrollToEventName === 'untilBottom') {
      await page.scrollUntilBottom(startingPoint);
    } else if (scrollToEventName === 'untilRight') {
      await page.scrollUntilRight(startingPoint);
    } else if (scrollToEventName === 'untilLeft') {
      await page.scrollUntilLeft(startingPoint);
    } else if (scrollToEventName === 'once' || !scrollToEventName) {
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
      // until mouse event is done
      await sleep(500);
    } else {
      throw new Error(
        `Unknown scroll event type: ${scrollToEventName}, param: ${JSON.stringify(
          param,
        )}`,
      );
    }
  }),
  defineActionDragAndDrop(async (param) => {
    const from = param.from;
    const to = param.to;
    assert(from, 'missing "from" param for drag and drop');
    assert(to, 'missing "to" param for drag and drop');
    await page.mouse.drag(
      {
        x: from.center[0],
        y: from.center[1],
      },
      {
        x: to.center[0],
        y: to.center[1],
      },
    );
  }),

  defineActionLongPress(async (param) => {
    const element = param.locate;
    assert(element, 'Element not found, cannot long press');
    const duration = param?.duration;
    await page.longPress(element.center[0], element.center[1], duration);
  }),

  defineActionSwipe(async (param) => {
    const { width, height } = await page.size();
    const { start, end } = param;

    const startPoint = start
      ? {
          x: start.center[0],
          y: start.center[1],
        }
      : {
          x: width / 2,
          y: height / 2,
        };

    let endPoint: {
      x: number;
      y: number;
    };

    if (end) {
      endPoint = {
        x: end.center[0],
        y: end.center[1],
      };
    } else if (param.distance) {
      const direction = param.direction;
      if (!direction) {
        throw new Error('direction is required for swipe gesture');
      }

      endPoint = {
        x:
          startPoint.x +
          (direction === 'right'
            ? param.distance
            : direction === 'left'
              ? -param.distance
              : 0),
        y:
          startPoint.y +
          (direction === 'down'
            ? param.distance
            : direction === 'up'
              ? -param.distance
              : 0),
      };
    } else {
      throw new Error(
        'Either end or distance must be specified for swipe gesture',
      );
    }

    // Ensure end coordinates are within bounds
    endPoint.x = Math.max(0, Math.min(endPoint.x, width));
    endPoint.y = Math.max(0, Math.min(endPoint.y, height));

    const duration = param.duration;

    debug(
      `swipe from ${startPoint.x}, ${startPoint.y} to ${endPoint.x}, ${endPoint.y} with duration ${duration}ms, repeat is set to ${param.repeat}`,
    );
    let repeat = typeof param.repeat === 'number' ? param.repeat : 1;
    if (repeat === 0) {
      repeat = 10; // 10 times is enough for infinite swipe
    }
    for (let i = 0; i < repeat; i++) {
      await page.swipe(startPoint, endPoint, duration);
    }
  }),

  defineActionClearInput(async (param) => {
    const element = param.locate;
    assert(element, 'Element not found, cannot clear input');
    await page.clearInput(element as unknown as ElementInfo);
  }),
];
