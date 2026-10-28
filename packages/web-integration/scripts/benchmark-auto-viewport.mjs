// Run after `pnpm exec nx build @midscene/web` from the repository root:
// PUPPETEER_EXECUTABLE_PATH=/path/to/chrome node packages/web-integration/scripts/benchmark-auto-viewport.mjs
import { performance } from 'node:perf_hooks';
import { commonContextParser } from '@midscene/core/agent';
import puppeteer from 'puppeteer';
import { Page as LegacyPage } from '../dist/es/puppeteer/base-page.mjs';
import { PuppeteerWebPage } from '../dist/es/puppeteer/page.mjs';

const samples = 40;
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox'],
});
const results = [];
const summarize = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)),
    p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(3)),
  };
};
try {
  for (const dpr of [1, 2]) {
    const page = await browser.newPage();
    await page.setViewport({
      width: 1440,
      height: 1000,
      deviceScaleFactor: dpr,
    });
    await page.setContent(
      '<body style="margin:0;background:linear-gradient(45deg,#ddd,#fff)"><button style="position:absolute;left:400px;top:90px">Login</button></body>',
    );
    const adapters = {
      legacy: new LegacyPage(page, 'puppeteer'),
      automatic: new PuppeteerWebPage(page),
    };
    const timings = { legacy: [], automatic: [] };
    const probes = [];
    const originalEvaluate = page.evaluate.bind(page);
    let countProbes = false;
    page.evaluate = async (...args) => {
      const start = performance.now();
      try {
        return await originalEvaluate(...args);
      } finally {
        if (countProbes) probes.push(performance.now() - start);
      }
    };
    for (let index = -5; index < samples; index++) {
      const order =
        index % 2 ? ['automatic', 'legacy'] : ['legacy', 'automatic'];
      for (const mode of order) {
        countProbes = index >= 0 && mode === 'automatic';
        const start = performance.now();
        await commonContextParser(adapters[mode], {});
        if (index >= 0) timings[mode].push(performance.now() - start);
      }
    }
    results.push({
      dpr,
      samplesPerMode: samples,
      legacy: summarize(timings.legacy),
      automatic: summarize(timings.automatic),
      liveRead: { count: probes.length, ...summarize(probes) },
    });
    await page.close();
  }
  console.log(
    JSON.stringify(
      {
        browser: await browser.version(),
        node: process.version,
        viewport: '1440x1000',
        transport: 'local CDP',
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
