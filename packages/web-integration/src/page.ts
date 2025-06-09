import type { Point, Size } from '@midscene/core';
import type { ElementInfo, ElementNode } from '@midscene/shared/extractor';
import type { WebKeyInput } from './common/page';
import type { WebUIContext } from './common/utils';

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
  abstract screenshotBlob?(): Promise<Blob>;
  abstract size(): Promise<Size>;

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
