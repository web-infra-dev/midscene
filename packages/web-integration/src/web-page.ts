import assert from 'node:assert';
import type { Point } from '@midscene/core';
import {
  AbstractDevice,
  type DeviceAction,
  defineActionDragAndDrop,
  defineActionHover,
  defineActionInput,
  defineActionKeyboardPress,
  defineActionRightClick,
  defineActionScroll,
  defineActionTap,
} from '@midscene/core/device';

import { sleep } from '@midscene/core/utils';
import type { ElementInfo } from '@midscene/shared/extractor';

export function getKeyCommands(
  value: string | string[],
): Array<{ key: string; command?: string }> {
  // Ensure value is an array of keys
  const keys = Array.isArray(value) ? value : [value];

  // Process each key to attach a corresponding command if needed, based on the presence of 'Meta' or 'Control' in the keys array.
  // ref: https://github.com/puppeteer/puppeteer/pull/9357/files#diff-32cf475237b000f980eb214a0a823e45a902bddb7d2426d677cae96397aa0ae4R94
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
    options: { button: MouseButton },
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

export abstract class AbstractWebPage extends AbstractDevice {
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
  defineActionHover(async (param) => {
    const element = param.locate;
    assert(element, 'Element not found, cannot hover');
    await page.mouse.move(element.center[0], element.center[1]);
  }),
  defineActionInput(async (param) => {
    const element = param.locate;
    if (element) {
      await page.clearInput(element as unknown as ElementInfo);

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
];
