import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { cases, fixture } from './boundary-fixtures.mjs';
const require = createRequire(
  new URL('../../../package.json', import.meta.url),
);
const puppeteer = require('puppeteer');
test('new boundary layouts start with hidden goals, expose horizontal range and allow correct visible clicks', async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox'],
  });
  try {
    for (const c of cases) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1000, height: 720 });
      await page.setContent(fixture(c));
      const before = await page.evaluate(() => window.snapshot());
      assert.ok(before.maxX > 1500, c.id);
      assert.equal(before.maxY, 0, c.id);
      const visible = () => {
        const r = document
          .querySelector('[data-target="true"]')
          .getBoundingClientRect();
        const p = document.querySelector('#target').getBoundingClientRect();
        return (
          r.left >= p.left &&
          r.right <= p.right &&
          r.top >= p.top &&
          r.bottom <= p.bottom
        );
      };
      assert.equal(await page.evaluate(visible), false, c.id);
      await page.evaluate((family) => {
        const t = document.querySelector('#target');
        t.scrollLeft = family === 'left' ? 0 : t.scrollWidth;
      }, c.family);
      assert.equal(await page.evaluate(visible), true, c.id);
      await page.click('[data-target="true"]');
      assert.deepEqual(
        (await page.evaluate(() => window.snapshot())).clicks,
        ['target'],
        c.id,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
