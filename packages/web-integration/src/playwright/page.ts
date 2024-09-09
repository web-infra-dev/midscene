import type { Page as PlaywrightPageType } from 'playwright';
import { Page as BasePage } from '../puppeteer/base-page';

export class Page extends BasePage<'playwright', PlaywrightPageType> {
  constructor(page: PlaywrightPageType) {
    super(page, 'playwright');
  }
}
