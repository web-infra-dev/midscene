import { PlaywrightBrowserAgent } from '@midscene/web/playwright';
import { afterAll, beforeAll, expect, it } from '@rstest/core';
import { type Browser, chromium } from 'playwright';
import { withReplay } from '../src/experimental';
import type { StrictLocate } from '../src/runtime/web-target';

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

for (const [width, height, deviceScaleFactor] of [
  [960, 720, 1],
  [375, 667, 2],
]) {
  it(`scrolls the located container through ActionSpace at ${width}x${height}, DPR ${deviceScaleFactor}`, async () => {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor,
    });
    const page = await context.newPage();
    await page.setContent(`
      <style>
        body { margin: 0; min-height: 2000px; }
        .panel { margin: 24px; height: 160px; overflow: auto; }
        .content { height: 1000px; background: #eee; position: relative; }
        .content button { position: absolute; top: 185px; left: 30px; }
      </style>
      <div id="selected" class="panel"><div class="content">
        Selected <button id="old-product" data-product="pen">Open Pen</button>
      </div></div>
      <div id="other" class="panel"><div class="content">Other</div></div>
      <output></output>
      <script>
        document.querySelector('#selected').addEventListener('scroll', () => {
          const old = document.querySelector('#old-product');
          if (old) {
            const fresh = old.cloneNode(true);
            fresh.id = 'new-product';
            old.replaceWith(fresh);
          }
        });
        document.addEventListener('click', ({ target }) => {
          if (target.dataset.product) document.querySelector('output').textContent = target.dataset.product;
        });
      </script>
    `);
    const agent = new PlaywrightBrowserAgent(context, page, {
      generateReport: false,
      modelConfig: {
        MIDSCENE_MODEL_NAME: 'qwen-test',
        MIDSCENE_MODEL_BASE_URL: 'http://127.0.0.1:1',
        MIDSCENE_MODEL_FAMILY: 'qwen3-vl',
        MIDSCENE_MODEL_API_KEY: 'test',
      },
    });
    try {
      const rp = withReplay(agent);
      const container: StrictLocate = {
        candidates: [{ xpath: '//div[@id="selected"]' }],
      };
      const product: StrictLocate = {
        within: { xpath: '//div[@id="selected"]' },
        candidates: [{ xpath: './/button[@data-product="pen"]' }],
        guard: { attr: { 'data-product': 'pen' } },
        timeoutMs: 0,
      };
      await expect(
        rp.tap('Open Pen before scroll', product),
      ).rejects.toMatchObject({
        code: 'TARGET_NOT_INTERACTABLE',
      });
      expect(
        await page
          .locator('#selected')
          .evaluate((element) => element.scrollTop),
      ).toBe(0);
      const distance = await page
        .locator('#selected')
        .evaluate((element) => element.clientHeight / 2);
      await rp.scroll('Scroll selected container down', {
        ...container,
        direction: 'down',
        distance,
      });
      await rp.waitFor('document.querySelector("#selected").scrollTop > 0', {
        timeoutMs: 1000,
      });
      const down = await page
        .locator('#selected')
        .evaluate((element) => element.scrollTop);
      await rp.waitFor('document.querySelector("#new-product")', {
        timeoutMs: 1000,
      });
      await rp.tap('Open Pen after scroll', product);
      await rp.expect({ xpath: '//output' }, { text: 'pen' });
      await rp.scroll('Scroll selected container up', {
        ...container,
        direction: 'up',
        distance,
      });
      await rp.waitFor(
        `document.querySelector("#selected").scrollTop < ${down}`,
        { timeoutMs: 1000 },
      );
      expect(
        await page.locator('#other').evaluate((element) => element.scrollTop),
      ).toBe(0);
      expect(await page.evaluate(() => scrollY)).toBe(0);
    } finally {
      await agent.destroy();
      await context.close();
    }
  }, 30_000);
}
