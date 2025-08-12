import type { DeviceAction, Point, ScrollParam, Size } from '@midscene/core';
import { sleep } from '@midscene/core/utils';
import type { ElementInfo, ElementNode } from '@midscene/shared/extractor';
import { assert } from '@midscene/shared/utils';
import type { WebKeyInput } from './common/page';
import { getKeyCommands } from './common/ui-utils';
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
  abstract scrollRight(distance?: number, startingPoint?: Point): Promise<void>;

  abstract _forceUsePageContext?(): Promise<WebUIContext>;

  abstract waitUntilNetworkIdle?(options?: {
    idleTime?: number;
    concurrency?: number;
  }): Promise<void>;

  abstract destroy(options?: ChromePageDestroyOptions): Promise<void>;

  abstract evaluateJavaScript?<T = any>(script: string): Promise<T>;
}

export const commonWebActionsForWebPage = <T extends AbstractPage>(
  page: T,
): DeviceAction[] => [
  {
    name: 'Tap',
    description: 'Tap the element',
    location: 'required',
    call: async (context) => {
      const { element } = context;
      assert(element, 'Element not found, cannot tap');
      await page.mouse.click(element.center[0], element.center[1], {
        button: 'left',
      });
    },
  },
  {
    name: 'RightClick',
    description: 'Right click the element',
    location: 'required',
    call: async (context) => {
      const { element } = context;
      assert(element, 'Element not found, cannot right click');
      await page.mouse.click(element.center[0], element.center[1], {
        button: 'right',
      });
    },
  },
  {
    name: 'Hover',
    description: 'Move the mouse to the element',
    location: 'required',
    call: async (context) => {
      const { element } = context;
      assert(element, 'Element not found, cannot hover');
      await page.mouse.move(element.center[0], element.center[1]);
    },
  },
  {
    name: 'Input',
    description: 'Replace the input field with a new value',
    paramSchema: '{ value: string }',
    paramDescription:
      '`value` is the final that should be filled in the input box. No matter what modifications are required, just provide the final value to replace the existing input value. Giving a blank string means clear the input field.',
    location: 'required',
    whatToLocate: 'The input field to be filled',
    call: async (context, param) => {
      const { element } = context;
      if (element) {
        await page.clearInput(element as unknown as ElementInfo);

        if (!param || !param.value) {
          return;
        }
      }

      // Note: there is another implementation in AndroidDevicePage, which is more complex
      await page.keyboard.type(param.value);
    },
  } as DeviceAction<{ value: string }>,
  {
    name: 'KeyboardPress',
    description: 'Press a key',
    paramSchema: '{ value: string }',
    paramDescription: 'The key to be pressed',
    location: false,
    call: async (context, param) => {
      const keys = getKeyCommands(param.value);
      await page.keyboard.press(keys as any); // TODO: fix this type error
    },
  } as DeviceAction<{ value: string }>,
  {
    name: 'Scroll',
    description: 'Scroll the page or an element',
    paramSchema:
      '{ direction: "down"(default) | "up" | "right" | "left", scrollType: "once" (default) | "untilBottom" | "untilTop" | "untilRight" | "untilLeft", distance: number | null }',
    paramDescription:
      'The direction to scroll, the scroll type, and the distance to scroll. The distance is the number of pixels to scroll. If not specified, use `down` direction, `once` scroll type, and `null` distance.',
    location: 'optional',
    whatToLocate: 'The element to be scrolled',
    call: async (context, param) => {
      const { element } = context;
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
    },
  } as DeviceAction<ScrollParam>,
];
