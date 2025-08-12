import type { DeviceAction, Point, Size } from '@midscene/core';
import type { ElementInfo, ElementNode } from '@midscene/shared/extractor';
import type { WebKeyInput } from './common/page';
import type { WebUIContext } from './web-element';

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
      | { key: WebKeyInput; command?: string }
      | { key: WebKeyInput; command?: string }[],
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
  abstract screenshotBase64?(): Promise<string>;
  abstract size(): Promise<Size>;
  abstract actionSpace(): DeviceAction[];

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
          | { key: WebKeyInput; command?: string }
          | { key: WebKeyInput; command?: string }[],
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
  abstract scrollRight(distance?: number): Promise<void>;

  abstract _forceUsePageContext?(): Promise<WebUIContext>;

  abstract waitUntilNetworkIdle?(options?: {
    idleTime?: number;
    concurrency?: number;
  }): Promise<void>;

  abstract destroy(options?: ChromePageDestroyOptions): Promise<void>;

  abstract evaluateJavaScript?<T = any>(script: string): Promise<T>;
}

const asyncNoop = async () => {};
export const commonWebActions: DeviceAction[] = [
  {
    name: 'Tap',
    description: 'Tap the element',
    location: 'required',
    call: asyncNoop,
  },
  {
    name: 'RightClick',
    description: 'Right click the element',
    location: 'required',
    call: asyncNoop,
  },
  {
    name: 'Hover',
    description: 'Move the mouse to the element',
    location: 'required',
    call: asyncNoop,
  },
  {
    name: 'Input',
    description: 'Replace the input field with a new value',
    paramSchema: '{ value: string }',
    paramDescription:
      '`value` is the final that should be filled in the input box. No matter what modifications are required, just provide the final value to replace the existing input value. Giving a blank string means clear the input field.',
    location: 'required',
    whatToLocate: 'The input field to be filled',
    call: asyncNoop,
  },
  {
    name: 'KeyboardPress',
    description: 'Press a key',
    paramSchema: '{ value: string }',
    paramDescription: 'The key to be pressed',
    location: false,
    call: asyncNoop,
  },
  {
    name: 'Scroll',
    description: 'Scroll the page or an element',
    paramSchema:
      '{ direction: "down"(default) | "up" | "right" | "left", scrollType: "once" (default) | "untilBottom" | "untilTop" | "untilRight" | "untilLeft", distance: number | null }',
    paramDescription:
      'The direction to scroll, the scroll type, and the distance to scroll. The distance is the number of pixels to scroll. If not specified, use `down` direction, `once` scroll type, and `null` distance.',
    location: 'optional',
    whatToLocate: 'The element to be scrolled',
    call: asyncNoop,
  },
  {
    name: 'Sleep',
    description: 'Sleep for a period of time',
    paramSchema: '{ timeMs: number }',
    paramDescription: 'The duration of the sleep in milliseconds',
    location: false,
    call: asyncNoop,
  },
];
