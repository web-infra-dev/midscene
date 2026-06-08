import { PuppeteerAgent, PuppeteerBrowserAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import type { Page as PuppeteerPage } from 'puppeteer';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEST_TIMEOUT,
  createTestContext,
  getFixturePath,
} from './test-utils';
import { launchPage } from './utils';

const clickNewTabLink = async (page: PuppeteerPage) => {
  const popupPromise = new Promise<PuppeteerPage>((resolve) => {
    page.once('popup', resolve);
  });

  await page.click('#newTabLink');
  const popup = await popupPromise;
  await popup.waitForSelector('.weather-container');
  return popup;
};

const tapNewTabLinkWithAgent = async (
  agent: PuppeteerAgent | PuppeteerBrowserAgent,
  page: PuppeteerPage,
) => {
  const popupPromise = new Promise<PuppeteerPage>((resolve) => {
    page.once('popup', resolve);
  });

  await agent.aiTap('the "Open in New Tab" link on the original page', {
    xpath: '//*[@id="newTabLink"]',
  });

  const popup = await popupPromise;
  await popup.waitForSelector('.weather-container');
  return popup;
};

const waitForAgentPage = async (
  agent: PuppeteerAgent | PuppeteerBrowserAgent,
  expectedPage: PuppeteerPage,
) => {
  for (let i = 0; i < 20; i++) {
    if (agent.page.underlyingPage === expectedPage) {
      return;
    }
    await sleep(100);
  }

  throw new Error('Timed out waiting for the agent to switch tabs');
};

describe(
  'Tab Navigation Tests',
  () => {
    const ctx = createTestContext();

    it('keeps page agent on current page when browser agent is not used', async () => {
      const htmlPath = getFixturePath('tab-navigation.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage, {
        forceSameTabNavigation: false,
      });

      const popup = await clickNewTabLink(originPage);

      expect(ctx.agent.page.underlyingPage).toBe(originPage);
      expect(originPage.url()).toContain('tab-navigation.html');
      expect(popup.url()).toContain('tab-navigation-target.html');
    });

    it('switches to a new page when controlled manually by browser agent', async () => {
      const htmlPath = getFixturePath('tab-navigation.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerBrowserAgent(originPage.browser(), originPage);

      const popup = await ctx.agent.waitForNewPage(() =>
        originPage.click('#newTabLink'),
      );
      await popup.waitForSelector('.weather-container');

      expect(ctx.agent.page.underlyingPage).toBe(originPage);

      await ctx.agent.setActivePage(popup);

      expect(ctx.agent.page.underlyingPage).toBe(popup);
      await expect(ctx.agent.page.url()).resolves.toContain(
        'tab-navigation-target.html',
      );
    });

    it('auto follows new page when browser agent option is enabled', async () => {
      const htmlPath = getFixturePath('tab-navigation.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerBrowserAgent(originPage.browser(), originPage, {
        autoFollowNewPage: true,
      });

      const popup = await tapNewTabLinkWithAgent(ctx.agent, originPage);
      await waitForAgentPage(ctx.agent, popup);

      expect(ctx.agent.page.underlyingPage).toBe(popup);
      await expect(ctx.agent.page.url()).resolves.toContain(
        'tab-navigation-target.html',
      );

      await ctx.agent.aiTap(
        'the "Weather Forecast" heading in the newly opened tab',
        {
          xpath: '//h2[text()="Weather Forecast"]',
        },
      );

      expect(ctx.agent.page.underlyingPage).toBe(popup);
    });

    it('keeps same-tab navigation behavior for page agent', async () => {
      const htmlPath = getFixturePath('tab-navigation.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage, {
        forceSameTabNavigation: true,
      });

      await originPage.click('#newTabLink');
      await originPage.waitForSelector('.weather-container');

      expect(ctx.agent.page.underlyingPage).toBe(originPage);
      expect(originPage.url()).toContain('tab-navigation-target.html');
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
