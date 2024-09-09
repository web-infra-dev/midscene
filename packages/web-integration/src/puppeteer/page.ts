import type { Page as PuppeteerPageType } from 'puppeteer';
import { Page as BasePage } from './base-page';

export class WebPage extends BasePage<'puppeteer', PuppeteerPageType> {
  constructor(page: PuppeteerPageType) {
    super(page, 'puppeteer');
  }
}
