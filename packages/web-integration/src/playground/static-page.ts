import {
  ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED,
  type WebUIContext,
} from '@/common/utils';
import type { AbstractPage } from '@/page';
import type { Point } from '@midscene/core';

const ThrowNotImplemented: any = (methodName: string) => {
  throw new Error(
    `The method "${methodName}" is not implemented as designed since this is a static UI context. (${ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED})`,
  );
};

export default class StaticPage implements AbstractPage {
  pageType = 'static';

  private uiContext: WebUIContext;

  constructor(uiContext: WebUIContext) {
    if (uiContext.tree) {
      this.uiContext = uiContext;
    } else {
      const contents = uiContext.content || [];
      this.uiContext = Object.assign(uiContext, {
        tree: {
          node: null,
          children: contents.map((content) => ({
            node: content,
            children: [],
          })),
        },
      });
    }
  }

  async evaluateJavaScript<T = any>(script: string): Promise<T> {
    return ThrowNotImplemented('evaluateJavaScript');
  }

  async getElementsInfo() {
    return ThrowNotImplemented('getElementsInfo');
  }

  async getElementsNodeTree() {
    return ThrowNotImplemented('getElementsNodeTree');
  }

  async getXpathsById(id: string) {
    return ThrowNotImplemented('getXpathsById');
  }

  async getElementInfoByXpath(xpath: string) {
    return ThrowNotImplemented('getElementInfoByXpath');
  }

  async size() {
    return this.uiContext.size;
  }

  async screenshotBase64() {
    const base64 = this.uiContext.screenshotBase64;
    if (!base64) {
      throw new Error('screenshot base64 is empty');
    }
    return base64;
  }

  async screenshotBlob() {
    const blob = this.uiContext.screenshotBlob;
    if (!blob) {
      throw new Error('screenshot blob is empty');
    }
    return blob;
  }

  async url() {
    return this.uiContext.url;
  }

  async scrollUntilTop(startingPoint?: Point) {
    return ThrowNotImplemented('scrollUntilTop');
  }

  async scrollUntilBottom(startingPoint?: Point) {
    return ThrowNotImplemented('scrollUntilBottom');
  }

  async scrollUntilLeft(startingPoint?: Point) {
    return ThrowNotImplemented('scrollUntilLeft');
  }

  async scrollUntilRight(startingPoint?: Point) {
    return ThrowNotImplemented('scrollUntilRight');
  }

  async scrollUp(distance?: number, startingPoint?: Point) {
    return ThrowNotImplemented('scrollUp');
  }

  async scrollDown(distance?: number, startingPoint?: Point) {
    return ThrowNotImplemented('scrollDown');
  }

  async scrollLeft(distance?: number, startingPoint?: Point) {
    return ThrowNotImplemented('scrollLeft');
  }

  async scrollRight(distance?: number, startingPoint?: Point) {
    return ThrowNotImplemented('scrollRight');
  }

  async clearInput() {
    return ThrowNotImplemented('clearInput');
  }

  mouse = {
    click: ThrowNotImplemented.bind(null, 'mouse.click'),
    wheel: ThrowNotImplemented.bind(null, 'mouse.wheel'),
    move: ThrowNotImplemented.bind(null, 'mouse.move'),
    drag: ThrowNotImplemented.bind(null, 'mouse.drag'),
  };

  keyboard = {
    type: ThrowNotImplemented.bind(null, 'keyboard.type'),
    press: ThrowNotImplemented.bind(null, 'keyboard.press'),
  };

  async _forceUsePageContext() {
    return this.uiContext;
  }

  async destroy(): Promise<void> {
    //
  }
}
