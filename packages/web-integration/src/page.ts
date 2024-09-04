import type { WebKeyInput } from './common/page';
import type { ElementInfo } from './extractor';

type imageType = 'jpeg' | 'png';
type encodingType = 'base64' | 'binary';

export type screenshotOptions = {
  path?: string;
  encoding?: encodingType;
  type?: imageType;
  quality?: number;
};
export type MouseButton = 'left' | 'right' | 'middle';

export abstract class AbstractPage {
  abstract pageType: string;
  abstract screenshot(
    options?: screenshotOptions,
  ): Promise<Buffer | Uint8Array>;
  abstract getElementInfos(): Promise<ElementInfo[]>;
  abstract url(): string;

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

  async selectAll(): Promise<void> {}

  abstract scrollUntilTop(): Promise<void>;
  abstract scrollUntilBottom(): Promise<void>;
  abstract scrollUpOneScreen(): Promise<void>;
  abstract scrollDownOneScreen(): Promise<void>;
}
