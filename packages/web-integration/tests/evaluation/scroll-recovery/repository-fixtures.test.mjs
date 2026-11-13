import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { cases, fixture } from './repository-fixtures.mjs';
const require = createRequire(
  new URL('../../../package.json', import.meta.url),
);
const puppeteer = require('puppeteer');

test('existing repository pages expose verifiable goals and reject incomplete work', async () => {
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
      const initial = await page.evaluate(() => window.snapshot());
      assert.equal(c.evaluate({ final: initial }).goalReached, false, c.id);
      await c.act(page);
      const final = await page.evaluate(() => window.snapshot());
      assert.deepEqual(
        c.evaluate({ final }),
        { goalReached: true, compliant: true },
        c.id,
      );
      if (c.id === 'repository-disabled-form') {
        await page.click('#cancel-btn');
        assert.equal(
          c.evaluate({ final: await page.evaluate(() => window.snapshot()) })
            .compliant,
          false,
        );
      }
      if (c.id === 'repository-login-popup') {
        assert.equal(
          c.evaluate({ final: { ...final, username: 'wrong-user' } })
            .goalReached,
          false,
        );
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
