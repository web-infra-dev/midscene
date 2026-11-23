// Optional. Only for login, special browser context, state reset or
// independent checks. Without it, trial/run use meta.startUrl with a
// headless Chromium PlaywrightBrowserAgent.
import { PlaywrightBrowserAgent } from '@midscene/web/playwright';
import { chromium } from 'playwright';

export const platform = 'web';
export const isolation = {
  browserContext: 'fresh',
  tab: 'new',
  businessState: 'not-reset',
};
const START = 'https://example.com/';

export async function open() {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const agent = await PlaywrightBrowserAgent.create(context, {
      generateReport: false,
    });
    return {
      agent,
      close: async () => {
        try {
          await agent.destroy();
        } finally {
          await browser.close();
        }
      },
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export async function reset(agent) {
  await agent.activePage.goto(START);
}

export async function verifyStart(agent) {
  return (await agent.evaluateJavaScript('location.href')) === START;
}

// Independent checks the script cannot do itself (backend API, reload).
export const checks = {};
