import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { cases, fixture } from './routine-fixtures.mjs';
const require = createRequire(
  new URL('../../../package.json', import.meta.url),
);
const puppeteer = require('puppeteer');
test('routine fixture outcomes and explicit no-op constraints are verifiable', async () => {
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
      await page.waitForFunction(() => window.oracle.ready);
      const initial = await page.evaluate(() => window.snapshot());
      let actions = [];
      switch (c.id) {
        case 'routine-signin':
          await page.type('#email', 'demo@example.test');
          await page.type('#password', 'sample-pass');
          await page.click('form button');
          break;
        case 'routine-preferences':
          await page.click('#email');
          await page.click('#save');
          break;
        case 'routine-dialog':
          await page.click('#open');
          await page.click('#cancel');
          break;
        case 'routine-search':
          await page.type('#query', 'Cedar');
          await page.click('#search');
          await page.click('#cedar');
          break;
        case 'routine-receipts':
          await page.evaluate(() => {
            document.querySelector('#target').scrollTop = 100000;
          });
          await page.click('[data-receipt="8"]');
          break;
        case 'routine-loadmore':
          await page.click('#more');
          await page.click('#more');
          await page.click('#finish');
          break;
        default:
          assert.ok(c.exact);
          for (let i = 0; i < 4; i++)
            await page.evaluate(() => {
              document.querySelector('#target').scrollTop += 100;
            });
          actions = Array.from({ length: 4 }, () => ({
            name: 'Scroll',
            param: { direction: 'down', distance: 100 },
          }));
      }
      const final = await page.evaluate(() => window.snapshot());
      assert.deepEqual(
        c.evaluate({ actions, initial, final }),
        { compliant: true, goalReached: true },
        c.id,
      );
      if (c.exact)
        assert.equal(
          c.evaluate({ actions: [], initial, final }).compliant,
          false,
          c.id,
        );
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
