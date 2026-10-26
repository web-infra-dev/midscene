const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const { chromium } = require(
  require.resolve('playwright', {
    paths: [path.resolve(__dirname, '../../packages/web-integration')],
  }),
);

// Allow sparse edge-rendering noise, but reject large color changes or moved content.
async function assertSimilarScreenshot(page, actual, expected, message) {
  const difference = await page.evaluate(
    async ([actualUrl, expectedUrl]) => {
      const decode = async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        return {
          width: canvas.width,
          height: canvas.height,
          pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
        };
      };
      const [a, b] = await Promise.all([
        decode(actualUrl),
        decode(expectedUrl),
      ]);
      if (a.width !== b.width || a.height !== b.height) {
        return { sameSize: false };
      }
      const result = {
        sameSize: true,
        changedPixels: 0,
        maxChannelDifference: 0,
        totalPixels: a.width * a.height,
      };
      for (let i = 0; i < a.pixels.length; i += 4) {
        const delta = Math.max(
          ...[0, 1, 2, 3].map((channel) =>
            Math.abs(a.pixels[i + channel] - b.pixels[i + channel]),
          ),
        );
        if (delta > 0) {
          result.changedPixels++;
          result.maxChannelDifference = Math.max(
            result.maxChannelDifference,
            delta,
          );
        }
      }
      return result;
    },
    [actual, expected].map(
      (png) => `data:image/png;base64,${png.toString('base64')}`,
    ),
  );
  assert.ok(difference.sameSize, `${message}: image dimensions differ`);
  // At most 0.01% of pixels may differ, and no channel may differ by more than 32/255.
  assert.ok(
    difference.changedPixels / difference.totalPixels <= 0.0001 &&
      difference.maxChannelDifference <= 32,
    `${message}: ${difference.changedPixels}/${difference.totalPixels} pixels differ; max channel difference ${difference.maxChannelDifference}`,
  );
}

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
    await direct.evaluate(() => window.__promoExport.renderFrame(1300));
    const first = await direct.screenshot();
    // Screenshot time must not advance either CSS transitions or the action clock.
    await assertSimilarScreenshot(
      direct,
      await direct.screenshot(),
      first,
      'frame must stay frozen',
    );
    for (let frame = 0; frame <= 39; frame++) {
      await stepped.evaluate(
        (ms) => window.__promoExport.renderFrame(ms),
        (frame * 1000) / 30,
      );
    }
    await assertSimilarScreenshot(
      stepped,
      await stepped.screenshot(),
      first,
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
      window.__promoExport.renderFrame(100),
    );
    const png = await page.screenshot({ scale: 'device' });
    assert.equal(png.readUInt32BE(16), 3840);
    assert.equal(png.readUInt32BE(20), 2160);
    const after = await page.evaluate(() =>
      window.__promoExport.renderFrame(200),
    );
    assert.equal(after.revision, before.revision);
    assert.equal(before.animations, 0);
    assert.equal(after.animations, 0);
    await assertSimilarScreenshot(
      page,
      await page.screenshot({ scale: 'device' }),
      png,
      'static frame must stay unchanged',
    );
    const changed = await page.evaluate(() =>
      window.__promoExport.renderFrame(1300),
    );
    assert.ok(changed.revision > after.revision);
    assert.ok(changed.animations > 0);
  } finally {
    await browser.close();
  }
});

test('preview music follows playback, pause, scene changes and restart', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const url = pathToFileURL(path.join(__dirname, 'index.html'));
    await page.goto(url.href);
    await page.waitForFunction(
      () => document.querySelector('#soundtrack').readyState >= 2,
    );
    assert.equal(
      await page.locator('#soundtrack').evaluate((audio) => audio.paused),
      true,
    );
    await page.locator('#start').click();
    await page.waitForFunction(() => {
      const audio = document.querySelector('#soundtrack');
      return !audio.paused && audio.currentTime > 0;
    });
    await page.keyboard.press('Space');
    assert.equal(
      await page.locator('#soundtrack').evaluate((audio) => audio.paused),
      true,
    );
    await page.keyboard.press('ArrowRight');
    const sceneStart = await page.evaluate(() => {
      const scenes = [...document.querySelectorAll('.scene')];
      const active = scenes.findIndex((scene) =>
        scene.classList.contains('active'),
      );
      return (
        scenes
          .slice(0, active)
          .reduce((sum, scene) => sum + Number(scene.dataset.dur), 0) / 1000
      );
    });
    assert.ok(
      Math.abs(
        (await page
          .locator('#soundtrack')
          .evaluate((audio) => audio.currentTime)) - sceneStart,
      ) < 0.05,
    );
    await page.keyboard.press('r');
    assert.ok(
      (await page
        .locator('#soundtrack')
        .evaluate((audio) => audio.currentTime)) < 0.05,
    );
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () => !document.querySelector('#soundtrack').paused,
    );
    url.search = 'export=1';
    await page.goto(url.href);
    await page.evaluate(() => window.__promoExport.renderFrame(10000));
    assert.equal(
      await page.locator('#soundtrack').evaluate((audio) => audio.paused),
      true,
    );
  } finally {
    await browser.close();
  }
});

test('screenshot tolerance accepts tiny noise but rejects visible changes', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const images = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const context = canvas.getContext('2d');
      context.fillStyle = 'rgb(128, 128, 128)';
      context.fillRect(0, 0, 100, 100);
      const original = canvas.toDataURL();
      context.fillStyle = 'rgb(129, 128, 128)';
      context.fillRect(0, 0, 1, 1);
      const noise = canvas.toDataURL();
      context.fillRect(0, 0, 10, 1);
      const widespread = canvas.toDataURL();
      context.fillStyle = 'white';
      context.fillRect(0, 0, 1, 1);
      return [original, noise, widespread, canvas.toDataURL()];
    });
    const [original, noise, widespread, highContrast] = images.map((url) =>
      Buffer.from(url.split(',')[1], 'base64'),
    );
    await assertSimilarScreenshot(page, noise, original, 'tiny noise');
    await assert.rejects(
      assertSimilarScreenshot(page, widespread, original, 'widespread change'),
      /pixels differ/,
    );
    await assert.rejects(
      assertSimilarScreenshot(
        page,
        highContrast,
        widespread,
        'high contrast change',
      ),
      /pixels differ/,
    );
  } finally {
    await browser.close();
  }
});
