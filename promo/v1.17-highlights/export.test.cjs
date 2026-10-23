const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const { chromium } = require(
  require.resolve('playwright', {
    paths: [path.resolve(__dirname, '../../packages/web-integration')],
  }),
);

test('export frames stay frozen and do not depend on capture frequency', async () => {
  const browser = await chromium.launch();
  try {
    const url = pathToFileURL(path.join(__dirname, 'index.html'));
    url.search = 'export=1';
    const open = async () => {
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      });
      await page.goto(url.href);
      await page.evaluate(() => document.fonts.ready);
      return page;
    };
    const direct = await open();
    const stepped = await open();
    await direct.evaluate(() => window.__promoExport.renderFrame(5700));
    const first = await direct.screenshot();
    // Screenshot time must not advance either CSS transitions or the action clock.
    assert.ok(
      (await direct.screenshot()).equals(first),
      'frame must stay frozen',
    );
    for (let frame = 0; frame <= 171; frame++) {
      await stepped.evaluate(
        (ms) => window.__promoExport.renderFrame(ms),
        (frame * 1000) / 30,
      );
    }
    assert.ok(
      (await stepped.screenshot()).equals(first),
      'stepped frame must match direct frame',
    );
    assert.equal(await direct.locator('#hud').count(), 0);
    const opacity = await direct
      .locator('#bw')
      .evaluate((el) => Number(getComputedStyle(el).opacity));
    assert.ok(
      opacity > 0 && opacity < 1,
      'capture must preserve the middle of a transition',
    );
    await assert.rejects(
      direct.evaluate(() => window.__promoExport.renderFrame(0)),
      /monotonically/,
    );
    await direct.evaluate(() =>
      window.__promoExport.renderFrame(window.__promoExport.duration),
    );
    assert.equal(
      await direct.locator('#outroUrl').textContent(),
      'midscenejs.com',
    );
    assert.equal(
      await direct.locator('#fm #mCostA').textContent(),
      '$0.000284',
    );
    assert.equal(
      await direct.locator('#rm #mCostA').textContent(),
      '$0.000221',
    );
  } finally {
    await browser.close();
  }
});

test('4K export renders native pixels and identifies reusable static frames', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
    });
    const url = pathToFileURL(path.join(__dirname, 'index.html'));
    url.search = 'export=1';
    await page.goto(url.href);
    await page.evaluate(() => document.fonts.ready);
    const before = await page.evaluate(() =>
      window.__promoExport.renderFrame(1000),
    );
    const png = await page.screenshot({ scale: 'device' });
    assert.equal(png.readUInt32BE(16), 3840);
    assert.equal(png.readUInt32BE(20), 2160);
    const after = await page.evaluate(() =>
      window.__promoExport.renderFrame(4000),
    );
    assert.equal(after.revision, before.revision);
    assert.equal(before.animations, 0);
    assert.equal(after.animations, 0);
    assert.ok((await page.screenshot({ scale: 'device' })).equals(png));
    const changed = await page.evaluate(() =>
      window.__promoExport.renderFrame(5700),
    );
    assert.ok(changed.revision > after.revision);
    assert.ok(changed.animations > 0);
  } finally {
    await browser.close();
  }
});
