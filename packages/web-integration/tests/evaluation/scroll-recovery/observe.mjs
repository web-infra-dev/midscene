import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cases, fixture } from './fixtures.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../../..');
const require = createRequire(
  path.join(root, 'packages/web-integration/package.json'),
);
require('dotenv').config({ path: path.join(root, '.env'), override: true });
const puppeteer = require('puppeteer');
const { ScreenshotItem } = require(
  path.join(root, 'packages/core/dist/lib/screenshot-item.js'),
);
const { getModelRuntime } = require(
  path.join(root, 'packages/core/dist/lib/ai-model/index.js'),
);
const { globalModelConfigManager } = require(
  path.join(root, 'packages/shared/dist/lib/env/index.js'),
);
const { reviewScroll } = require(
  path.join(
    root,
    'packages/core/dist/lib/ai-model/workflows/planning/scroll-review.js',
  ),
);
const model = getModelRuntime(
  globalModelConfigManager.getModelConfig('default'),
);
const out = path.join(
  path.resolve(process.env.MIDSCENE_RUN_DIR || path.join(root, 'midscene_run')),
  'test-results',
  'scroll-recovery-evaluation',
  `observer-${Date.now()}`,
);
await mkdir(out, { recursive: true });
console.log(`EVAL_OUTPUT ${out}`);
await writeFile(
  path.join(out, 'manifest.json'),
  JSON.stringify(
    {
      source: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      runnerSHA: createHash('sha256')
        .update(await readFile(fileURLToPath(import.meta.url)))
        .digest('hex'),
      model: model.config.modelName,
      family: model.config.modelFamily,
      fixtureSHA: createHash('sha256')
        .update(await readFile(new URL('./fixtures.mjs', import.meta.url)))
        .digest('hex'),
      note: 'Deterministic rendered fixtures; delayed visibility is unscored/ambiguous. Not original-site validation.',
    },
    null,
    2,
  ),
);
const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  args: ['--no-sandbox'],
  ignoreDefaultArgs: ['--hide-scrollbars'],
});
const selected = cases.filter(
  (c) =>
    !process.env.EVAL_CASES || process.env.EVAL_CASES.split(',').includes(c.id),
);
let next = 0;
async function sample(c) {
  const page = await browser.newPage();
  const dir = path.join(out, c.id);
  await mkdir(dir);
  let record = { caseId: c.id, family: c.family, split: c.split };
  try {
    await page.setViewport({ width: 1000, height: 720 });
    await page.setContent(fixture(c));
    const beforeState = await page.evaluate(() => window.snapshot());
    const before = await page.screenshot({
      path: path.join(dir, 'before.png'),
      encoding: 'base64',
    });
    const moving = [
      'down',
      'up',
      'nested-moving',
      'neighbors',
      'explicit',
      'reading',
      'delayed',
      'virtual',
      'loadmore',
    ].includes(c.family);
    const direction = c.family === 'up' ? 'up' : 'down';
    await page.evaluate(
      ({ moving, direction, family }) => {
        const t = document.querySelector('#target');
        if (moving) t.scrollTop += direction === 'up' ? -150 : 150;
        if (family === 'outer-motion')
          document.querySelector('#outer').scrollTop = 100;
        if (family === 'container-swap')
          t.dispatchEvent(new WheelEvent('wheel'));
        if (family === 'layout-shift') t.style.transform = 'translateX(-100px)';
      },
      { moving, direction, family: c.family },
    );
    await new Promise((resolve) =>
      setTimeout(resolve, c.family === 'delayed' ? 100 : 250),
    );
    const afterState = await page.evaluate(() => window.snapshot());
    const after = await page.screenshot({
      path: path.join(dir, 'after.png'),
      encoding: 'base64',
    });
    await writeFile(
      path.join(dir, 'before.png'),
      Buffer.from(before, 'base64'),
    );
    await writeFile(path.join(dir, 'after.png'), Buffer.from(after, 'base64'));
    const ui = (base64) => ({
      screenshot: ScreenshotItem.create(
        `data:image/png;base64,${base64}`,
        Date.now(),
      ),
      shotSize: { width: 1000, height: 720 },
      shrunkShotToLogicalRatio: 1,
    });
    const rect = beforeState.rect;
    const expected = [
      'delayed',
      'virtual',
      'layout-shift',
      'container-swap',
    ].includes(c.family)
      ? null
      : moving
        ? 'moved'
        : 'unchanged';
    const permitted =
      c.family === 'left'
        ? ['left']
        : ['right', 'animation', 'jitter'].includes(c.family)
          ? ['right']
          : c.family === 'outer-motion'
            ? ['right']
            : [];
    const result = await reviewScroll({
      task: {
        type: 'Action Space',
        subType: 'Scroll',
        taskId: c.id,
        status: 'finished',
        param: {
          direction,
          locate: {
            description: 'Records',
            center: [rect.left + rect.width / 2, rect.top + rect.height / 2],
            rect,
          },
        },
        uiContext: ui(before),
      },
      current: ui(after),
      modelRuntime: model,
      abortSignal: AbortSignal.timeout(90000),
    });
    record = {
      ...record,
      beforeState,
      afterState,
      expected,
      permitted,
      observation: result.content,
      usage: result.usage,
      correct: expected === null ? null : result.content.progress === expected,
      unsupportedDirection:
        expected !== null &&
        result.content.nextSearchDirection !== null &&
        !permitted.includes(result.content.nextSearchDirection),
    };
  } catch (e) {
    record.error = e.message;
  } finally {
    await page.close();
  }
  await writeFile(
    path.join(dir, 'result.json'),
    JSON.stringify(record, null, 2),
  );
  await appendFile(
    path.join(out, 'results.jsonl'),
    `${JSON.stringify(record)}\n`,
  );
  console.log(c.id, record.correct, record.error || '');
}
try {
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < selected.length) await sample(selected[next++]);
    }),
  );
} finally {
  await browser.close();
}
