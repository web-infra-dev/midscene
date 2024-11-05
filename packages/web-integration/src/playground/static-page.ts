import {
  ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED,
  type WebUIContext,
} from '@/common/utils';
import type { AbstractPage } from '@/page';

const ThrowNotImplemented: any = (methodName: string) => {
  throw new Error(
    `The method "${methodName}" is not implemented as designed since this is a static UI context. (${ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED})`,
  );
};

export default class StaticPage implements AbstractPage {
  pageType = 'static';

  private uiContext: WebUIContext;

  constructor(uiContext: WebUIContext) {
    this.uiContext = uiContext;
  }

  async getElementInfos() {
    return ThrowNotImplemented('getElementInfos');
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

  async url() {
    return this.uiContext.url;
  }

  async scrollUntilTop() {
    return ThrowNotImplemented('scrollUntilTop');
  }

  async scrollUntilBottom() {
    return ThrowNotImplemented('scrollUntilBottom');
  }

  async scrollUpOneScreen() {
    return ThrowNotImplemented('scrollUpOneScreen');
  }

  async scrollDownOneScreen() {
    return ThrowNotImplemented('scrollDownOneScreen');
  }

  async clearInput() {
    return ThrowNotImplemented('clearInput');
  }

  mouse = {
    click: ThrowNotImplemented.bind(null, 'mouse.click'),
    wheel: ThrowNotImplemented.bind(null, 'mouse.wheel'),
    move: ThrowNotImplemented.bind(null, 'mouse.move'),
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
