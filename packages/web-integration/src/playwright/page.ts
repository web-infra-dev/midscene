import type { Page as PlaywrightPageType } from 'playwright';
import { Page as BasePage } from '../puppeteer/base-page';
import type { WebPageOpt } from '../web-element';

export class WebPage extends BasePage<'playwright', PlaywrightPageType> {
  constructor(page: PlaywrightPageType, opts?: WebPageOpt) {
    super(page, 'playwright', opts);
  }
}
