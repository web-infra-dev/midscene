import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { createReport, createViewer, loadTestcases } from '../dist/index.mjs';

// This suite exercises the installed-style build, with no model requests and no
// imports from src or the old benchmark viewer. Real screenshots stay untouched.
const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
const repositoryDirectory = fileURLToPath(
  new URL('../../../', import.meta.url),
);
const cli = path.join(packageDirectory, 'dist/cli/index.mjs');
const artifacts = path.join(
  repositoryDirectory,
  'midscene_run/test-results/benchmark-grounding-e2e',
);
const temporary = await mkdtemp(
  path.join(os.tmpdir(), 'midscene-grounding-e2e-'),
);
const runDirectory = path.join(temporary, 'run');
const liveTestcases = path.join(temporary, 'live-testcases');
const names = ['MOBILE-v1-001', 'WEB-v1-001', 'WEB-v1-067'];
const models = [
  {
    name: 'fixture-alpha',
    family: 'qwen3',
    displayName: 'Fixture Alpha',
    directory: 'alpha',
  },
  {
    name: 'fixture-beta',
    family: 'qwen3',
    displayName: 'Fixture Beta',
    directory: 'beta',
  },
];
const browserErrors = [];
const unexpectedRequests = [];
const apiRequests = [];
let browser;
let viewer;
let viewerOutput = '';
let viewerError = '';
let succeeded = false;

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function embeddedData(html) {
  const script = html.match(
    /<script\b[^>]*\bid=(?:"benchmark-data"|'benchmark-data'|benchmark-data)[^>]*>([\s\S]*?)<\/script\s*>/i,
  );
  assert.ok(script, 'HTML must contain the embedded benchmark-data script');
  return JSON.parse(script[1]);
}

function pointOutput(record, correct) {
  const truth = record.testcase.groundTruth;
  assert.notEqual(truth, 'REFUSAL');
  const [top, right, bottom, left] = truth;
  return {
    type: 'POINT',
    correct,
    center: correct ? [(left + right) / 2, (top + bottom) / 2] : [0, 0],
    rect: correct
      ? { left, top, width: right - left, height: bottom - top }
      : { left: 0, top: 0, width: 20, height: 20 },
    dpr: 1,
  };
}

function errorOutput(message, retryable = false) {
  return {
    type: 'ERROR',
    correct: false,
    error: { name: 'FixtureError', message, code: 'E_FIXTURE', retryable },
  };
}

function attempt(output, durationMs = 500, usageStatus = 'complete') {
  return {
    output,
    profiling: {
      durationMs,
      usageStatus,
      calls: 1,
      totalPromptTokens: 20,
      totalCompletionTokens: 4,
      totalTokens: 24,
    },
  };
}

function result(record, model, attempts) {
  const usageStatus = attempts.every(
    ({ profiling }) => profiling.usageStatus === 'complete',
  )
    ? 'complete'
    : 'partial';
  const profiling = {
    durationMs: 0,
    usageStatus,
    calls: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
  };
  for (const current of attempts) {
    for (const key of [
      'durationMs',
      'calls',
      'totalPromptTokens',
      'totalCompletionTokens',
      'totalTokens',
    ])
      profiling[key] += current.profiling[key];
  }
  return {
    schemaVersion: 1,
    consistency: { testcaseSha256: record.testcaseSha256 },
    input: {
      testcase: record.testcase.name,
      model: model.name,
      family: model.family,
      displayName: model.displayName,
      platform: record.testcase.platform,
      instruction:
        record.testcase.instruction[record.testcase.instructionLanguage],
      groundTruth: record.testcase.groundTruth,
    },
    output: attempts.at(-1).output,
    profiling,
    attempts,
  };
}

async function makeRun(records) {
  await mkdir(runDirectory, { recursive: true });
  for (const record of records) {
    const directory = path.join(
      runDirectory,
      'testcases',
      record.testcase.name,
    );
    await mkdir(directory, { recursive: true });
    await Promise.all(
      Object.entries(record.files).map(([filename, bytes]) =>
        writeFile(path.join(directory, filename), bytes),
      ),
    );
  }
  const [mobile, web, refusal] = records;
  const results = [
    result(mobile, models[0], [
      attempt(errorOutput('Fixture temporary issue', true), 250),
      attempt(pointOutput(mobile, true)),
    ]),
    result(mobile, models[1], [attempt(pointOutput(mobile, false), 80)]),
    result(web, models[0], [
      attempt(errorOutput('Fixture final failure'), 600, 'partial'),
    ]),
    result(web, models[1], [attempt(pointOutput(web, true), 90)]),
    result(refusal, models[0], [
      attempt({ type: 'REFUSAL', correct: true }, 300),
    ]),
    // Beta's refusal result is deliberately absent, rather than a failed result.
  ];
  const run = {
    schemaVersion: 1,
    id: 'offline-fixture',
    startedAt: '2026-11-12T00:00:00.000Z',
    endedAt: '2026-11-12T00:00:03.000Z',
    status: 'interrupted',
    planned: 6,
    completed: 5,
    versions: { package: 'fixture', sdk: 'fixture' },
    options: { concurrency: 2, retries: 1, timeoutMs: 60000 },
    models,
    testcases: records.map((record) => ({
      name: record.testcase.name,
      testcaseSha256: record.testcaseSha256,
    })),
    tasks: models.flatMap((model) =>
      records.map((record) => ({
        model: model.displayName,
        testcase: record.testcase.name,
      })),
    ),
  };
  const reference = {
    source: 'Offline fixture reference',
    url: 'https://example.com/reference',
    observedAt: '2026-11-12T00:00:00Z',
    pricing: {
      currency: 'USD',
      inputPerToken: 0.000001,
      outputPerToken: 0.000002,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 1000,
      outputTokensPerSecond: 20,
    },
  };
  const logo = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="9" fill="#9363d8"/></svg>').toString('base64')}`;
  const meta = {
    models: Object.fromEntries(
      models.map((model) => [
        model.displayName,
        { displayFamily: 'Fixture', reference },
      ]),
    ),
    families: { Fixture: { color: '#9363d8', logo } },
  };
  for (const model of models)
    await mkdir(path.join(runDirectory, 'results', model.directory), {
      recursive: true,
    });
  await Promise.all([
    writeFile(path.join(runDirectory, 'run.json'), JSON.stringify(run)),
    writeFile(path.join(runDirectory, 'meta.json'), JSON.stringify(meta)),
    ...results.map((item) =>
      writeFile(
        path.join(
          runDirectory,
          'results',
          models.find((model) => model.displayName === item.input.displayName)
            .directory,
          `${item.input.testcase}.json`,
        ),
        JSON.stringify(item),
      ),
    ),
  ]);
  await cp(path.join(runDirectory, 'testcases'), liveTestcases, {
    recursive: true,
  });
}

async function runCLI(args, entry = cli) {
  const child = spawn(process.execPath, [entry, ...args], {
    cwd: temporary,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 30000);
  try {
    const [code, signal] = await once(child, 'exit');
    assert.equal(
      code,
      0,
      `CLI ${args[0]} failed (${signal ?? code}): ${stderr}`,
    );
    return { stdout, stderr };
  } finally {
    clearTimeout(timeout);
  }
}

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function startViewer() {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  viewer = spawn(
    process.execPath,
    [
      cli,
      'viewer',
      '--testcases',
      liveTestcases,
      '--port',
      String(port),
      '--no-open',
    ],
    { cwd: temporary, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  viewer.stdout.on('data', (chunk) => {
    viewerOutput += chunk;
  });
  viewer.stderr.on('data', (chunk) => {
    viewerError += chunk;
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => done(new Error(`Viewer did not start: ${viewerError}`)),
      15000,
    );
    function done(error) {
      clearTimeout(timer);
      viewer.stdout.off('data', check);
      viewer.off('error', onError);
      viewer.off('exit', onExit);
      error ? reject(error) : resolve();
    }
    function check() {
      if (viewerOutput.includes(url)) done();
    }
    function onError(error) {
      done(error);
    }
    function onExit(code, signal) {
      done(
        new Error(
          `Viewer exited before listening (${signal ?? code}): ${viewerError}`,
        ),
      );
    }
    viewer.stdout.on('data', check);
    viewer.on('error', onError);
    viewer.on('exit', onExit);
    check();
  });
  return url;
}

async function stopViewer() {
  if (!viewer || viewer.exitCode !== null || viewer.signalCode !== null) return;
  const child = viewer;
  const exited = once(child, 'exit');
  child.kill('SIGINT');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    const [code, signal] = await exited;
    assert.ok(
      signal === 'SIGINT' || code === 130 || code === 0,
      `Viewer must stop cleanly on Ctrl+C (${signal ?? code})`,
    );
  } finally {
    clearTimeout(timer);
    viewer = undefined;
  }
}

async function newPage(allowedOrigin) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    const isAPI = ['fetch', 'xhr', 'websocket'].includes(
      request.resourceType(),
    );
    if (isAPI) apiRequests.push(url);
    const allowed =
      /^(?:data|blob|about):/.test(url) ||
      (/^file:/.test(url) &&
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame()) ||
      (allowedOrigin && new URL(url).origin === allowedOrigin);
    if (!allowed) unexpectedRequests.push(url);
    void (allowed && !isAPI ? request.continue() : request.abort()).catch(
      () => {},
    );
  });
  if (!allowedOrigin) await page.setOfflineMode(true);
  return page;
}

async function waitForCase(page, name, model) {
  await page.waitForFunction(
    (expectedName, expectedModel) =>
      document.querySelector('#case-name')?.textContent === expectedName &&
      (!expectedModel ||
        document
          .querySelector('.case-model-option[aria-current="true"]')
          ?.textContent?.includes(expectedModel)),
    { polling: 100 },
    name,
    model,
  );
  await page.waitForFunction(() => {
    const image = document.querySelector('img.screenshot');
    return (
      image?.complete &&
      image.naturalWidth > 0 &&
      document.querySelector('#image-viewport')?.hidden === false
    );
  });
}

async function clickModel(page, name) {
  await page.evaluate((model) => {
    const link = [...document.querySelectorAll('.case-model-option')].find(
      (item) => item.firstElementChild?.textContent === model,
    );
    if (!link) throw new Error(`Model switch is missing: ${model}`);
    link.click();
  }, name);
}

async function chooseFilter(page, id, option) {
  await page.click(`#${id}-filter-trigger`);
  await page.waitForSelector(`#${id}-filter-options`, { visible: true });
  await page.evaluate((text) => {
    const element = [
      ...document.querySelectorAll('[role="listbox"] [role="option"]'),
    ].find((item) => item.textContent === text);
    if (!element) throw new Error(`Filter option is missing: ${text}`);
    element.click();
  }, option);
}

async function assertOverlay(page, record, output) {
  const actual = await page.evaluate(() => {
    const image = document.querySelector('img.screenshot');
    const truth = document.querySelector('.gt-box');
    const prediction = document.querySelector('.prediction-point');
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      groundTruth: truth
        ? {
            left: Number.parseFloat(truth.style.left),
            top: Number.parseFloat(truth.style.top),
            hidden: truth.hidden,
          }
        : null,
      prediction: prediction
        ? {
            left: Number.parseFloat(prediction.style.left),
            top: Number.parseFloat(prediction.style.top),
            hidden: prediction.hidden,
          }
        : null,
    };
  });
  assert.ok(
    actual.width > 100 && actual.height > 100,
    'The real embedded screenshot must load',
  );
  const truth = record.testcase.groundTruth;
  assert.notEqual(truth, 'REFUSAL');
  assert.ok(
    Math.abs((actual.groundTruth.left / 100) * actual.width - truth[3]) < 0.01,
  );
  assert.ok(
    Math.abs((actual.groundTruth.top / 100) * actual.height - truth[0]) < 0.01,
  );
  assert.ok(
    Math.abs((actual.prediction.left / 100) * actual.width - output.center[0]) <
      0.01,
  );
  assert.ok(
    Math.abs((actual.prediction.top / 100) * actual.height - output.center[1]) <
      0.01,
  );
  assert.equal(actual.groundTruth.hidden, false);
  assert.equal(actual.prediction.hidden, false);
}

async function capture(page, filename) {
  try {
    await page.screenshot({
      path: path.join(artifacts, filename),
      fromSurface: true,
      captureBeyondViewport: false,
      fullPage: false,
    });
  } catch (error) {
    console.info(
      `Optional screenshot ${filename} unavailable: ${error.message}`,
    );
  }
}

async function exerciseReport(filename, records) {
  const page = await newPage();
  await page.goto(pathToFileURL(filename).href, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('#model-breakdown-title', { visible: true });
  assert.equal(await page.evaluate(() => location.hash), '#/overview');
  assert.deepEqual(
    await page.$$eval('.page-navigation a', (items) =>
      items.map((item) => item.textContent),
    ),
    ['Overview', 'Testcases'],
  );
  const zeroDuration = await page.$$eval(
    '.model-breakdown-table tbody tr',
    (items, name) =>
      items
        .find(
          (item) =>
            item.querySelector('.model-breakdown-name').textContent === name,
        )
        .querySelectorAll('td')[5].textContent,
    models[1].displayName,
  );
  assert.equal(
    zeroDuration.trim(),
    '0.00 s',
    'A corrected duration of zero must remain visible',
  );

  assert.match(
    await page.$eval(
      '.model-performance-heading',
      (element) => element.textContent,
    ),
    /Model Performance Overview/,
  );
  assert.match(
    await page.$eval(
      '#testcase-results-title',
      (element) => element.textContent,
    ),
    /Testcase Score Overview/,
  );
  assert.match(
    await page.$eval('.incomplete-run', (element) => element.textContent),
    /1 missing results/,
  );
  await page.waitForFunction(
    () => document.querySelectorAll('.scatter-model').length === 2,
    { polling: 100 },
  );
  assert.equal(
    await page.$$eval('.performance-mini-radar', (items) => items.length),
    2,
  );
  assert.equal(
    await page.$$eval(
      '.model-breakdown-table tbody tr',
      (items) => items.length,
    ),
    2,
  );
  assert.equal(
    await page.$$eval('.result-matrix tbody tr', (items) => items.length),
    3,
  );
  await page.click('.model-breakdown-sort[aria-label="Score"]');
  assert.equal(
    await page.$eval('.model-breakdown-name', (element) => element.textContent),
    models[0].displayName,
  );
  await page.click('.model-breakdown-sort[aria-label="Score"]');
  assert.equal(
    await page.$eval('.model-breakdown-name', (element) => element.textContent),
    models[1].displayName,
  );
  await page.$eval('.overview-page', (element) => {
    element.scrollTop = 0;
  });
  await capture(page, 'report-overview.png');

  await page.click(
    '.matrix-cell[aria-label="MOBILE-v1-001 · Fixture Alpha · Passed"]',
  );
  await waitForCase(page, names[0], models[0].displayName);
  await assertOverlay(page, records[0], pointOutput(records[0], true));
  await page.click('#result-attempts > summary');
  assert.match(
    await page.$eval('#result-attempts', (element) => element.textContent),
    /Fixture temporary issue/,
  );
  assert.match(
    await page.$eval('#result-attempts', (element) => element.textContent),
    /Attempt 2/,
  );
  await page.click('#show-gt');
  assert.equal(await page.$eval('.gt-box', (element) => element.hidden), true);
  await page.click('#show-gt');
  await page.click('#show-prediction');
  assert.equal(
    await page.$eval('.prediction-point', (element) => element.hidden),
    true,
  );
  await page.click('#show-prediction');
  await page.click('#zoom-actual');
  await clickModel(page, models[1].displayName);
  await waitForCase(page, names[0], models[1].displayName);
  assert.equal(
    await page.$eval('#zoom-actual', (element) =>
      element.getAttribute('aria-pressed'),
    ),
    'true',
  );
  assert.equal(
    await page.$eval('#zoom-value', (element) => element.textContent),
    '100%',
  );
  await assertOverlay(page, records[0], pointOutput(records[0], false));
  await page.click('#next-case');
  await waitForCase(page, names[1], models[1].displayName);
  assert.equal(
    await page.$eval('#zoom-actual', (element) =>
      element.getAttribute('aria-pressed'),
    ),
    'true',
  );
  await clickModel(page, models[0].displayName);
  await waitForCase(page, names[1], models[0].displayName);
  assert.match(
    await page.$eval('.evaluation-error', (element) => element.textContent),
    /Fixture final failure/,
  );
  assert.equal(await page.$('.prediction-point'), null);
  await page.click('#zoom-fit');
  await capture(page, 'report-case.png');

  await page.click('.page-navigation a[href="#/overview"]');
  await page.waitForSelector('#testcase-results-title', { visible: true });
  await page.click(
    '.matrix-cell[aria-label="WEB-v1-067 · Fixture Beta · No result"]',
  );
  await waitForCase(page, names[2], models[1].displayName);
  assert.equal(
    await page.$eval(
      '.evaluation-summary .evaluation-status',
      (element) => element.textContent,
    ),
    'No result',
  );
  assert.match(
    await page.$eval(
      '.no-result-explanation',
      (element) => element.textContent,
    ),
    /excluded from scores/,
  );
  assert.equal(
    await page.$eval('#show-gt', (element) => element.disabled),
    true,
  );
  await clickModel(page, models[0].displayName);
  await waitForCase(page, names[2], models[0].displayName);
  assert.equal(
    await page.$eval(
      '.evaluation-summary .evaluation-status',
      (element) => element.textContent,
    ),
    'Passed',
  );
  assert.match(
    await page.$eval('.prediction-value', (element) => element.textContent),
    /Refusal/,
  );
  return page;
}

async function exerciseViewer(filename, records) {
  const page = await newPage();
  await page.goto(pathToFileURL(filename).href, {
    waitUntil: 'domcontentloaded',
  });
  await waitForCase(page, names[0]);
  assert.deepEqual(
    await page.$$eval('.case-button-name', (items) =>
      items.map((item) => item.textContent),
    ),
    names,
  );
  assert.equal(await page.$('.case-model-switcher'), null);
  assert.equal(await page.$('.page-navigation'), null);
  assert.equal(
    await page.$eval('#instruction-zh', (element) => element.textContent),
    records[0].testcase.instruction.zh,
  );
  assert.equal(
    await page.$eval('#testcase-sha', (element) => element.textContent),
    records[0].testcaseSha256,
  );
  await page.type('#search', 'Nikon 横向');
  await waitForCase(page, names[1]);
  assert.equal(await page.$$eval('.case-list li', (items) => items.length), 1);
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await page.$eval('#case-name', (element) => element.textContent),
    names[1],
    'Typing/navigation inside search must not change cases',
  );
  await page.click('#clear-filters');
  // Exercise the custom filter's keyboard interaction, including focus restoration.
  await page.click('#platform-filter-trigger');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitForCase(page, names[0]);
  assert.equal(await page.$$eval('.case-list li', (items) => items.length), 1);
  assert.equal(
    await page.$eval('#next-case', (element) => element.disabled),
    true,
  );
  await page.click('#clear-filters');
  await page.keyboard.press('ArrowRight');
  await waitForCase(page, names[1]);
  await page.keyboard.press('ArrowLeft');
  await waitForCase(page, names[0]);
  await chooseFilter(page, 'category', 'Refusal');
  await waitForCase(page, names[2]);
  assert.equal(
    await page.$eval('#show-gt', (element) => element.disabled),
    true,
  );
  await page.click('#clear-filters');
  await chooseFilter(page, 'dataset', 'WebClick');
  await waitForCase(page, names[2]);
  assert.equal(await page.$$eval('.case-list li', (items) => items.length), 1);
  await page.click('#clear-filters');
  await chooseFilter(page, 'outcome', 'Refusal');
  await waitForCase(page, names[2]);
  assert.equal(await page.$$eval('.case-list li', (items) => items.length), 1);
  await page.click('#clear-filters');
  await page.click('#previous-case');
  await waitForCase(page, names[1]);
  await page.click('#zoom-actual');
  await page.focus('#image-viewport');
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await page.$eval('#case-name', (element) => element.textContent),
    names[1],
    'Arrow keys scroll an image at 100% without navigating cases',
  );
  await page.click('#zoom-fit');
  await capture(page, 'viewer.png');
  return page;
}

async function exerciseLiveViewer(records) {
  const url = await startViewer();
  const origin = new URL(url).origin;
  function imageURL(data, name) {
    const testcase = data.testcases.find((item) => item.name === name);
    const image = new URL(testcase.image, url);
    assert.equal(image.origin, origin);
    assert.equal(
      image.pathname,
      `/images/${encodeURIComponent(name)}/image.${testcase.reference.image.format === 'jpeg' ? 'jpg' : 'png'}`,
    );
    assert.equal(
      image.searchParams.get('sha256'),
      testcase.reference.image.sha256,
    );
    return image.href;
  }
  async function verifyImage(image, expectedSha) {
    const response = await fetch(image, { signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), expectedSha);
  }
  const initial = await fetch(url, { signal: AbortSignal.timeout(10000) });
  assert.equal(initial.status, 200);
  assert.equal(initial.headers.get('cache-control'), 'no-store');
  const initialData = embeddedData(await initial.text());
  assert.equal(initialData.testcases.length, 3);
  await Promise.all(
    records.map((record) =>
      verifyImage(
        imageURL(initialData, record.testcase.name),
        record.testcase.reference.image.sha256,
      ),
    ),
  );
  const originalImage = imageURL(initialData, names[1]);
  const withoutVersion = new URL(originalImage);
  withoutVersion.search = '';
  const missingVersion = await fetch(withoutVersion, {
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(missingVersion.status, 409);
  assert.match(await missingVersion.text(), /reload/i);
  const wrongFilename = new URL(originalImage);
  wrongFilename.pathname = wrongFilename.pathname.replace(
    /image\.png$/,
    'image.jpg',
  );
  assert.equal(
    (await fetch(wrongFilename, { signal: AbortSignal.timeout(10000) })).status,
    404,
  );

  const page = await newPage(origin);
  await page.goto(`${url}#/testcases/${names[1]}`, {
    waitUntil: 'domcontentloaded',
  });
  await waitForCase(page, names[1]);
  assert.equal(
    await page.$eval('img.screenshot', (element) => element.src),
    originalImage,
  );
  assert.equal(
    await page.$eval('#open-image', (element) => element.href),
    originalImage,
  );
  assert.equal(
    await page.$eval('#instruction-en', (element) => element.textContent),
    records[1].testcase.instruction.en,
  );
  await page.click('#previous-case');
  await waitForCase(page, names[0]);
  assert.equal(
    await page.$eval('img.screenshot', (element) => element.src),
    imageURL(initialData, names[0]),
  );
  await page.click('#next-case');
  await waitForCase(page, names[1]);
  assert.equal(
    await page.$eval('img.screenshot', (element) => element.src),
    originalImage,
  );

  const changed = structuredClone(records[1].testcase);
  changed.instruction.en = 'Freshly refreshed Nikon fixture';
  const bytes = Buffer.from(`${JSON.stringify(changed, null, 2)}\n`);
  const sha = `${hash(bytes)}\n`;
  const directory = path.join(liveTestcases, names[1]);
  await writeFile(path.join(directory, 'index.json'), bytes);
  await writeFile(path.join(directory, 'index.sha256'), sha);
  const refreshed = await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(refreshed.status(), 200);
  await waitForCase(page, names[1]);
  assert.equal(
    await page.$eval('#instruction-en', (element) => element.textContent),
    changed.instruction.en,
  );
  const freshResponse = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });
  const freshData = embeddedData(await freshResponse.text());
  assert.equal(
    freshData.testcases.find((item) => item.name === names[1]).testcaseSha256,
    hash(bytes),
  );

  // Encode a one-pixel edit using the browser's native PNG encoder. Only this
  // temporary fixture changes; the bundled dataset remains byte-for-byte intact.
  const editedImage = Buffer.from(
    await page.$eval('img.screenshot', (image) => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      context.fillStyle = '#ff00ff';
      context.fillRect(0, 0, 1, 1);
      return canvas.toDataURL('image/png').split(',')[1];
    }),
    'base64',
  );
  changed.reference.image.sha256 = hash(editedImage);
  const editedJSON = Buffer.from(`${JSON.stringify(changed, null, 2)}\n`);
  const editedSha = `${hash(editedJSON)}\n`;
  await writeFile(path.join(directory, 'image.png'), editedImage);
  await writeFile(path.join(directory, 'index.json'), editedJSON);
  await writeFile(path.join(directory, 'index.sha256'), editedSha);
  const staleImage = await fetch(originalImage, {
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(staleImage.status, 409);
  assert.equal(staleImage.headers.get('cache-control'), 'no-store');
  assert.match(await staleImage.text(), /reload/i);
  const imageRefresh = await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(imageRefresh.status(), 200);
  await waitForCase(page, names[1]);
  const editedData = embeddedData(
    await (await fetch(url, { signal: AbortSignal.timeout(10000) })).text(),
  );
  const updatedImage = imageURL(editedData, names[1]);
  assert.notEqual(updatedImage, originalImage);
  assert.equal(
    new URL(updatedImage).searchParams.get('sha256'),
    hash(editedImage),
  );
  assert.equal(
    await page.$eval('img.screenshot', (element) => element.src),
    updatedImage,
  );
  assert.equal(
    await page.$eval('#open-image', (element) => element.href),
    updatedImage,
  );
  await verifyImage(updatedImage, hash(editedImage));

  await writeFile(path.join(directory, 'index.sha256'), `${'0'.repeat(64)}\n`);
  const invalid = await fetch(url, { signal: AbortSignal.timeout(10000) });
  assert.equal(invalid.status, 500);
  assert.equal(invalid.headers.get('cache-control'), 'no-store');
  const invalidHTML = await invalid.text();
  assert.match(invalidHTML, /SHA-256 mismatch/);
  assert.ok(
    !invalidHTML.includes('benchmark-data'),
    'Damaged snapshots must not return stale HTML',
  );
  const failedReload = await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(failedReload.status(), 500);
  assert.match(
    await page.$eval('body', (element) => element.textContent),
    /Unable to load testcases/,
  );
  await writeFile(path.join(directory, 'index.sha256'), editedSha);
  const restored = await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(restored.status(), 200);
  await waitForCase(page, names[1]);
  assert.equal(
    await page.$eval('#instruction-en', (element) => element.textContent),
    changed.instruction.en,
  );
  assert.equal(
    await page.$eval('img.screenshot', (element) => element.src),
    updatedImage,
  );
  await stopViewer();
  await assert.rejects(
    fetch(url, { signal: AbortSignal.timeout(3000) }),
    'Viewer port must close after Ctrl+C',
  );
}

try {
  await mkdir(artifacts, { recursive: true });
  const manifest = JSON.parse(
    await readFile(path.join(packageDirectory, 'package.json'), 'utf8'),
  );
  for (const entry of Object.values(manifest.exports)) {
    for (const filename of typeof entry === 'string'
      ? [entry]
      : Object.values(entry)) {
      assert.ok(
        (await readFile(path.join(packageDirectory, filename))).length > 0,
        `Published entry must exist and be nonempty: ${filename}`,
      );
    }
  }
  assert.ok(
    (await readFile(cli, 'utf8')).startsWith('#!/usr/bin/env node'),
    'Built CLI must retain its Node shebang',
  );
  const records = await loadTestcases({
    names: [names[2], names[0], names[1]],
  });
  assert.deepEqual(
    records.map((record) => record.testcase.name),
    names,
  );
  await makeRun(records);
  const html = await createReport({ runDirectory });
  const report = embeddedData(html);
  assert.equal(report.mode, 'report');
  assert.equal(report.missingResults, 1);
  assert.equal(report.summaries.completed, 5);
  assert.ok(
    Math.abs(
      report.summaries.models.find(
        (model) => model.model === models[0].displayName,
      ).score -
        200 / 3,
    ) < 1e-10,
  );
  assert.equal(
    report.summaries.models.find(
      (model) => model.model === models[1].displayName,
    ).score,
    50,
  );
  assert.equal(
    report.summaries.models.find(
      (model) => model.model === models[1].displayName,
    ).estimatedElapsedTime.average,
    0,
  );
  assert.ok(!html.includes('__MIDSCENE_BENCHMARK_DATA__'));
  const generated = path.join(temporary, 'sdk-report.html');
  await writeFile(generated, html);
  const viewerFile = path.join(temporary, 'viewer.html');
  const viewerHTML = await createViewer({ testcases: records });
  assert.ok(
    embeddedData(viewerHTML).testcases.every((testcase) =>
      testcase.image.startsWith('data:image/'),
    ),
    'SDK viewers remain self-contained by default',
  );
  await writeFile(viewerFile, viewerHTML);
  const cliReport = path.join(temporary, 'cli-output/report.html');
  const linkedCLI = path.join(temporary, 'linked-benchmark-grounding.mjs');
  await symlink(cli, linkedCLI);
  const help = await runCLI(['--help'], linkedCLI);
  assert.match(help.stdout, /midscene-benchmark-grounding/);
  assert.match(help.stdout, /viewer/);
  assert.match(help.stdout, /report/);
  const output = await runCLI([
    'report',
    runDirectory,
    '--output',
    cliReport,
    '--no-open',
  ]);
  assert.match(output.stdout, /Report:/);
  assert.equal(await readFile(cliReport, 'utf8'), html);
  console.info('Passed built SDK assembly and CLI report generation.');

  const exported = path.join(temporary, 'relocated/exported-report.html');
  await mkdir(path.dirname(exported), { recursive: true });
  await cp(generated, exported);
  await rm(generated);
  await rename(runDirectory, path.join(temporary, 'moved-run'));
  browser = await puppeteer.launch({
    headless: 'shell',
    protocolTimeout: 8000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  await exerciseReport(exported, records);
  console.info(
    'Passed offline file report, matrix navigation and per-model evidence.',
  );
  await exerciseViewer(viewerFile, records);
  console.info(
    'Passed standalone viewer filters, screenshot and keyboard navigation.',
  );
  await exerciseLiveViewer(records);
  console.info(
    'Passed live CLI viewer refresh, hash validation and Ctrl+C cleanup.',
  );
  assert.deepEqual(
    unexpectedRequests,
    [],
    'HTML must not request external scripts, styles, images, fonts or services',
  );
  assert.deepEqual(
    apiRequests,
    [],
    'Embedded UI must not use fetch/XHR/WebSocket',
  );
  assert.deepEqual(
    browserErrors,
    [],
    'Browser must render without JavaScript errors',
  );
  succeeded = true;
  await rm(path.join(artifacts, 'failure.json'), { force: true });
  await writeFile(
    path.join(artifacts, 'success.json'),
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        cases: 3,
        models: 2,
        results: 5,
        missing: 1,
        browserErrors,
        unexpectedRequests,
        apiRequests,
      },
      null,
      2,
    ),
  );
  console.info(`Benchmark grounding e2e passed. Screenshots: ${artifacts}`);
} catch (error) {
  if (browser) {
    for (const [index, page] of (await browser.pages()).entries()) {
      await capture(page, `failure-${index}.png`);
    }
  }
  await writeFile(
    path.join(artifacts, 'failure.json'),
    JSON.stringify(
      {
        temporary,
        message: error instanceof Error ? error.stack : String(error),
        browserErrors,
        unexpectedRequests,
        apiRequests,
        viewerOutput,
        viewerError,
      },
      null,
      2,
    ),
  );
  console.error(
    `E2E failed; retained fixture: ${temporary}; diagnostics: ${artifacts}`,
  );
  throw error;
} finally {
  await stopViewer();
  await browser?.close();
  if (succeeded) await rm(temporary, { recursive: true, force: true });
}
