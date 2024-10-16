import { writeFileSync } from 'node:fs';
import type { WebUIContext } from '@/common/utils';
import type { AbstractPage } from '@/page';
import { getTmpFile } from '@midscene/core/utils';
import { saveBase64Image } from '@midscene/shared/img';

const ThrowNotImplemented: any = () => {
  throw new Error('This method is not implemented in static page');
};

export default class StaticPage implements AbstractPage {
  pageType = 'static';

  private uiContext: WebUIContext;

  constructor(uiContext: WebUIContext) {
    this.uiContext = uiContext;
  }

  async getElementInfos() {
    return [];
  }

  async screenshot() {
    const base64 = this.uiContext.screenshotBase64;
    if (!base64) {
      throw new Error('screenshot base64 is empty');
    }
    const tmpFilePath = getTmpFile('png');
    await saveBase64Image({ base64Data: base64, outputPath: tmpFilePath });
    return tmpFilePath;
  }

  url() {
    return this.uiContext.url;
  }

  async scrollUntilTop() {
    return ThrowNotImplemented;
  }

  async scrollUntilBottom() {
    return ThrowNotImplemented;
  }

  async scrollUpOneScreen() {
    return ThrowNotImplemented;
  }

  async scrollDownOneScreen() {
    return ThrowNotImplemented;
  }

  async clearInput() {
    return ThrowNotImplemented;
  }

  mouse = {
    click: ThrowNotImplemented,
    wheel: ThrowNotImplemented,
    move: ThrowNotImplemented,
  };

  keyboard = {
    type: ThrowNotImplemented,
    press: ThrowNotImplemented,
  };

  async _forceUsePageContext() {
    // console.warn('static page _forceUsePageContext is called', this.uiContext);
    return this.uiContext;
  }
}
