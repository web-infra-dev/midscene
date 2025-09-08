import type { WebPageOpt } from '@/web-element';
import type { Page as PuppeteerPageType } from 'puppeteer';
import { Page as BasePage, debugPage } from './base-page';

export class PuppeteerWebPage extends BasePage<'puppeteer', PuppeteerPageType> {
  constructor(page: PuppeteerPageType, opts?: WebPageOpt) {
    super(page, 'puppeteer', opts);
  }
}
