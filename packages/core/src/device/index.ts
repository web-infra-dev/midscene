import type { ElementInfo, ElementNode } from '@midscene/shared/extractor';
import type { DeviceAction, Point, Size, UIContext } from '../types';

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

export abstract class AbstractPage {
  abstract pageType: string;
  // @deprecated
  abstract getElementsInfo(): Promise<ElementInfo[]>;
  abstract getElementsNodeTree(): Promise<ElementNode>;
  abstract url(): string | Promise<string>;
  abstract screenshotBase64(): Promise<string>;
  abstract size(): Promise<Size>;
  abstract actionSpace(): DeviceAction[] | Promise<DeviceAction[]>;

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

  abstract beforeAction?(): Promise<void>;

  abstract destroy(options?: ChromePageDestroyOptions): Promise<void>;

  abstract evaluateJavaScript?<T = any>(script: string): Promise<T>;

  abstract getContext?(): Promise<UIContext>;
}
