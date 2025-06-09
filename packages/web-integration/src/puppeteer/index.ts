import { PageAgent, type PageAgentOpt } from '@/common/agent';
import { forceClosePopup } from '@/common/utils';
import { getDebug } from '@midscene/shared/logger';
import type { Page as PuppeteerPage } from 'puppeteer';
import type { AndroidDeviceInputOpt } from '../common/page';
import { type PuppeteerPageOpt, WebPage as PuppeteerWebPage } from './page';

const debug = getDebug('puppeteer:agent');

export { WebPage as PuppeteerWebPage } from './page';
export type { AndroidDeviceInputOpt };
export type PuppeteerAgentOpt = PageAgentOpt & PuppeteerPageOpt;

export class PuppeteerAgent extends PageAgent<PuppeteerWebPage> {
  constructor(page: PuppeteerPage, opts?: PuppeteerAgentOpt) {
    const webPage = new PuppeteerWebPage(page);
    super(webPage, opts);

    const { forceSameTabNavigation = true } = opts ?? {};

    if (forceSameTabNavigation) {
      forceClosePopup(page, debug);
    }
  }

  async aiDatePicker(page: PuppeteerPage, date: Date) {
    const year = date.getFullYear();
    const monthIndex = date.getMonth(); // 0-11
    const day = date.getDate();
    const formattedDay = String(day).padStart(2, '0'); // DD
    const formattedMonth = String(monthIndex + 1).padStart(2, '0'); // MM
    const monthDayYear = `${formattedMonth}/${formattedDay}/${year}`;

    const monthAbbreviations = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthAbbreviations[monthIndex];

    await page.locator('th[title="Select Month"]').click();
    await page.locator('th[title="Select Year"]').click();
    await page.locator('th[title="Select Decade"]').click();

    await this.selectDecadeForYear(page, year);
    await page.locator(`span[data-action="selectYear"] ::-p-text(${year})`).click();
    await page.locator(`span[data-action="selectMonth"] ::-p-text(${month})`).click();
    await page.locator(`td[data-day="${monthDayYear}"]`).click();
  }

  async selectDecadeForYear(
    page: PuppeteerPage,
    targetYear: number,
  ): Promise<boolean> {
    try {
      // 在浏览器上下文中查找匹配的 data-selection 值
      const result = await page.$$eval(
        'span.decade[data-action="selectDecade"]',
        (spans, year) => {
          for (const span of spans) {
            const text = span.textContent?.trim();
            if (text) {
              const match = text.match(/(\d{4})\s*-\s*(\d{4})/);
              if (match) {
                const startYear = parseInt(match[1]);
                const endYear = parseInt(match[2]);

                if (year >= startYear && year <= endYear) {
                  return {
                    dataSelection: span.getAttribute('data-selection'),
                    range: text,
                  };
                }
              }
            }
          }
          return null;
        },
        targetYear,
      );

      if (result) {
        // 使用 Locator API 点击找到的元素
        await page
          .locator(`span[data-selection="${result.dataSelection}"]`)
          .click();
        console.log(`Clicked decade span: ${result.range}`);
        return true;
      }

      console.log(`Year ${targetYear} not found in any decade range`);
      return false;
    } catch (error) {
      console.log('Error selecting decade:', error);
      return false;
    }
  }
}

export { overrideAIConfig } from '@midscene/shared/env';

// Do NOT export this since it requires puppeteer
// export { puppeteerAgentForTarget } from './agent-launcher';
