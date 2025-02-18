import type { PageAgentOpt } from '@/common/agent';
import type { Page as PlaywrightPageType } from 'playwright';
import { Page as BasePage } from '../puppeteer/base-page';

export class WebPage extends BasePage<'playwright', PlaywrightPageType> {
  constructor(page: PlaywrightPageType) {
    super(page, 'playwright');
  }
}
