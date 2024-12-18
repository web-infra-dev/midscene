import type { Size } from '@midscene/core/.';
import type { WebKeyInput } from './common/page';
import type { WebUIContext } from './common/utils';
import type { ElementInfo } from './extractor';

export type MouseButton = 'left' | 'right' | 'middle';

export abstract class AbstractPage {
  abstract pageType: string;
  abstract getElementInfos(): Promise<ElementInfo[]>;
  abstract url(): string | Promise<string>;
  abstract screenshotBase64?(): Promise<string>;
  abstract size(): Promise<Size>;

  get mouse() {
    return {
      click: async (
        x: number,
        y: number,
        options: { button: MouseButton },
      ) => {},
      wheel: async (deltaX: number, deltaY: number) => {},
      move: async (x: number, y: number) => {},
    };
  }

  get keyboard() {
    return {
      type: async (text: string) => {},
      press: async (key: WebKeyInput) => {},
    };
  }

  async clearInput(element: ElementInfo): Promise<void> {}

  abstract scrollUntilTop(): Promise<void>;
  abstract scrollUntilBottom(): Promise<void>;
  abstract scrollUntilLeft(): Promise<void>;
  abstract scrollUntilRight(): Promise<void>;
  abstract scrollUp(distance?: number): Promise<void>;
  abstract scrollDown(distance?: number): Promise<void>;
  abstract scrollLeft(distance?: number): Promise<void>;
  abstract scrollRight(distance?: number): Promise<void>;

  abstract _forceUsePageContext?(): Promise<WebUIContext>;

  abstract waitUntilNetworkIdle?(options?: {
    idleTime?: number;
    concurrency?: number;
  }): Promise<void>;

  abstract destroy(): Promise<void>;
}
