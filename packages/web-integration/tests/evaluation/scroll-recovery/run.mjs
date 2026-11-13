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
if (process.env.EVAL_FEEDBACK_ONLY === '1')
  throw new Error(
    'Feedback-only is now the production policy. Use EVAL_ARMS=3. Replay the old ablation at its recorded revision.',
  );
const requestedArms = (process.env.EVAL_ARMS || '0,2,3').split(',').map(Number);
if (
  !requestedArms.length ||
  new Set(requestedArms).size !== requestedArms.length ||
  requestedArms.some((arm) => ![0, 2, 3].includes(arm))
)
  throw new Error('Invalid EVAL_ARMS');
const { PuppeteerAgent } = require(
  path.join(root, 'packages/web-integration/dist/lib/puppeteer/index.js'),
);
const repetitions = Number(process.env.EVAL_REPETITIONS || 1);
const workers = Number(process.env.EVAL_WORKERS || 3);
if (
  !Number.isSafeInteger(repetitions) ||
  repetitions < 1 ||
  !Number.isSafeInteger(workers) ||
  workers < 1
)
  throw new Error('Invalid repetitions/workers');
const track = process.env.EVAL_TRACK || 'natural';
if (!['natural', 'controlled', 'oracle'].includes(track))
  throw new Error('Invalid track');
const selected = cases.filter(
  (c) =>
    (!process.env.EVAL_CASES ||
      process.env.EVAL_CASES.split(',').includes(c.id)) &&
    (track !== 'controlled' || c.controlled),
);
if (!selected.length) throw new Error('No matching cases');
const runId =
  process.env.EVAL_RUN_ID || new Date().toISOString().replaceAll(/[:.]/g, '-');
const base = path.resolve(
  process.env.MIDSCENE_RUN_DIR || path.join(root, 'midscene_run'),
);
const out = path.join(
  base,
  'test-results',
  'scroll-recovery-evaluation',
  runId,
);
await mkdir(path.dirname(out), { recursive: true });
await mkdir(out, { recursive: false });
const source = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const sourceDiff = execFileSync('git', ['diff', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
});
await writeFile(path.join(out, 'source.patch'), sourceDiff);
const sourceDiffSHA = createHash('sha256').update(sourceDiff).digest('hex');
const runnerSHA = createHash('sha256')
  .update(await readFile(fileURLToPath(import.meta.url)))
  .digest('hex');
const sha = createHash('sha256')
  .update(await readFile(new URL('./fixtures.mjs', import.meta.url)))
  .digest('hex');
const jobs = [];
for (const c of selected)
  for (let rep = 0; rep < repetitions; rep++) {
    const arms = track === 'oracle' ? [0] : requestedArms;
    // Reproducible balanced rotation; no outcome-based ordering.
    const offset = (rep + cases.indexOf(c)) % arms.length;
    for (const arm of [...arms.slice(offset), ...arms.slice(0, offset)])
      jobs.push({ c, rep, arm });
  }
await writeFile(
  path.join(out, 'manifest.json'),
  JSON.stringify(
    {
      source,
      sourceDiffSHA,
      runnerSHA,
      policy: 'retained-history',
      fixtureSHA: sha,
      track,
      repetitions,
      workers,
      viewport: { width: 1000, height: 720 },
      maxActions: 14,
      timeoutMs: 180000,
      model: process.env.MIDSCENE_MODEL_NAME,
      family: process.env.MIDSCENE_MODEL_FAMILY,
      jobs: jobs.map(({ c, rep, arm }) => ({
        case: c.id,
        split: c.split,
        rep,
        arm,
      })),
    },
    null,
    2,
  ),
);
await writeFile(
  path.join(out, 'runner-source.mjs'),
  await readFile(fileURLToPath(import.meta.url)),
);
await writeFile(
  path.join(out, 'fixtures-source.mjs'),
  await readFile(new URL('./fixtures.mjs', import.meta.url)),
);
console.log(`EVAL_OUTPUT ${out}`);
const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  args: ['--no-sandbox'],
  ignoreDefaultArgs: ['--hide-scrollbars'],
});
let interruptedBy;
const activeControllers = new Set();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    interruptedBy = signal;
    for (const controller of activeControllers)
      controller.abort(`Evaluation interrupted by ${signal}`);
  });
async function attempt({ c, rep, arm }) {
  const id = `${c.id}-${track}-${arm}-${rep}`;
  const dir = path.join(out, id);
  await mkdir(dir);
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const start = Date.now();
  const actions = [];
  const calls = [];
  const usage = [];
  let agent;
  let error;
  let prefix = 0;
  let before;
  let final;
  let reviews = [];
  let scrollEvidence = [];
  let initial;
  const controller = new AbortController();
  activeControllers.add(controller);
  const timer = setTimeout(
    () => controller.abort(new Error('Evaluation wall-clock budget exhausted')),
    180000,
  );
  try {
    await page.setViewport({ width: 1000, height: 720 });
    const html = fixture(c);
    await writeFile(path.join(dir, 'fixture.html'), html);
    await page.setContent(html);
    await page.waitForFunction(() => window.oracle.ready);
    initial = await page.evaluate(() => window.snapshot());
    await page.screenshot({ path: path.join(dir, 'initial.png') });
    if (track === 'oracle') {
      const oracle = await page.evaluate(async (family) => {
        const t = document.querySelector('#target');
        const rect = t.getBoundingClientRect();
        const point = [rect.left + rect.width / 2, rect.top + rect.height / 2];
        const beforeContainer = document
          .elementFromPoint(...point)
          ?.closest('#target, #neighbor')?.id;
        if (family === 'container-swap')
          t.dispatchEvent(new WheelEvent('wheel'));
        const afterContainer = document
          .elementFromPoint(...point)
          ?.closest('#target, #neighbor')?.id;
        const samePointChangedContainer =
          beforeContainer === 'target' && afterContainer === 'neighbor';
        const jitterStaysInTarget = [-3, 3].every(
          (dx) =>
            document
              .elementFromPoint(point[0] + dx, point[1])
              ?.closest('#target') === t,
        );
        document.querySelector('#close-notices')?.click();
        const more = document.querySelector('#load-more');
        while (more && !more.hidden) more.click();
        t.scrollLeft = family === 'left' ? 0 : t.scrollWidth;
        t.scrollTop = family === 'up' ? 0 : t.scrollHeight;
        await new Promise((resolve) => setTimeout(resolve, 800));
        const end = window.snapshot();
        const button = document.querySelector(
          '[data-target="true"], [data-virtual="true"]',
        );
        const reading = ['reading', 'loadmore'].includes(family);
        const targetExists = reading
          ? t.textContent.includes('RIVER-729')
          : !!button;
        if (reading) {
          document.querySelector('#answer').value = 'RIVER-729';
          document.querySelector('form').requestSubmit();
        } else if (button) button.click();
        const clickWorks = window.snapshot().clicks.includes('target');
        t.scrollLeft = 0;
        t.scrollTop = 0;
        return {
          end,
          start: window.snapshot(),
          targetExists,
          clickWorks,
          samePointChangedContainer,
          jitterStaysInTarget,
        };
      }, c.family);
      if (
        c.family === 'boundary'
          ? oracle.end.maxX !== 0 || oracle.end.maxY !== 0
          : oracle.end.maxX <= 0 && oracle.end.maxY <= 0
      )
        throw new Error('Fixture overflow oracle invalid');
      if (
        c.family !== 'boundary' &&
        (!oracle.targetExists || !oracle.clickWorks)
      )
        throw new Error('Fixture outcome oracle invalid');
      if (c.family === 'container-swap' && !oracle.samePointChangedContainer)
        throw new Error('Container-swap oracle did not change hit target');
      if (c.family === 'jitter' && !oracle.jitterStaysInTarget)
        throw new Error('Jitter oracle crossed container boundary');
      final = oracle;
    } else {
      agent = new PuppeteerAgent(page, {
        cache: false,
        generateReport: false,
        replanningCycleLimit: 18,
        onLLMUsage: (value) => usage.push(value),
        createOpenAIClient: async (client) => {
          const create = client.chat.completions.create.bind(
            client.chat.completions,
          );
          client.chat.completions.create = async (body, options) => {
            const system = JSON.stringify(
              body.messages.filter((m) => m.role === 'system'),
            );
            const planning = system.includes('action-type');
            if (track === 'controlled' && planning && prefix < 2) {
              prefix++;
              // Inject a fixed erroneous plan, not a page mutation or an observer result.
              const param = { direction: 'down', distance: 200 };
              if (
                [
                  'neighbors',
                  'jitter',
                  'layout-shift',
                  'container-swap',
                ].includes(c.family)
              ) {
                if (
                  !['doubao-seed', 'qwen3'].includes(
                    process.env.MIDSCENE_MODEL_FAMILY,
                  )
                )
                  throw new Error(
                    'Coordinate-injection cases require verified 1000-normalized bbox encoding (doubao-seed or qwen3)',
                  );
                let x = initial.rect.left + initial.rect.width / 2;
                let y = initial.rect.top + initial.rect.height / 2;
                let description = 'Records';
                if (c.family === 'jitter') x += prefix === 1 ? -3 : 3;
                if (c.family === 'neighbors' && prefix === 2) {
                  x = 930;
                  y = 300;
                  description = 'Notes';
                }
                param.locate = {
                  prompt: description,
                  bbox: [
                    x - 10,
                    ((y - 10) / 720) * 1000,
                    x + 10,
                    ((y + 10) / 720) * 1000,
                  ].map(Math.round),
                };
              }
              const content = `<planning>Continue scrolling down through the records.</planning><log>Scroll down</log><action-type>Scroll</action-type><action-param-json>${JSON.stringify(param)}</action-param-json>`;
              calls.push({ synthetic: true, type: 'prefix', time: Date.now() });
              if (body.stream)
                return (async function* () {
                  yield {
                    id: `${id}-prefix-${prefix}`,
                    object: 'chat.completion.chunk',
                    created: 0,
                    model: body.model,
                    choices: [
                      {
                        index: 0,
                        delta: { role: 'assistant', content },
                        finish_reason: null,
                      },
                    ],
                  };
                  yield {
                    id: `${id}-prefix-${prefix}`,
                    object: 'chat.completion.chunk',
                    created: 0,
                    model: body.model,
                    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                  };
                })();
              return {
                id: `${id}-prefix-${prefix}`,
                object: 'chat.completion',
                created: 0,
                model: body.model,
                choices: [
                  {
                    index: 0,
                    finish_reason: 'stop',
                    message: { role: 'assistant', content },
                  },
                ],
                usage: {
                  prompt_tokens: 0,
                  completion_tokens: 0,
                  total_tokens: 0,
                },
              };
            }
            const call = {
              type: planning ? 'planning' : 'other',
              time: Date.now(),
              synthetic: false,
            };
            calls.push(call);
            try {
              return await create(body, options);
            } catch (e) {
              call.error = e.message;
              throw e;
            } finally {
              call.durationMs = Date.now() - call.time;
            }
          };
          return client;
        },
        beforeInvokeAction: async (name, param) => {
          if (actions.length >= 14)
            throw new Error('Evaluation action budget exhausted');
          before = await page.evaluate(() => window.snapshot());
          await page.screenshot({
            path: path.join(dir, `before-${actions.length}.png`),
          });
          actions.push({ name, param, before, time: Date.now() });
        },
        afterInvokeAction: async () => {
          const action = actions.at(-1);
          action.after = await page.evaluate(() => window.snapshot());
          await page.screenshot({
            path: path.join(dir, `after-${actions.length - 1}.png`),
          });
        },
      });
      await agent.aiAct(c.prompt, {
        scrollRecovery: arm ? { afterScrolls: arm } : false,
        cacheable: false,
        abortSignal: controller.signal,
      });
    }
  } catch (e) {
    error = e.message;
  } finally {
    clearTimeout(timer);
    activeControllers.delete(controller);
    if (agent) {
      scrollEvidence = agent.dump.executions
        .flatMap((e) => e.tasks)
        .filter((t) => t.subType === 'Scroll')
        .map((t) => ({ taskId: t.taskId, progress: t.scrollProgress }));
      reviews = agent.dump.executions
        .flatMap((e) => e.tasks)
        .filter((t) => t.subType === 'ScrollReview')
        .map((t) => ({
          status: t.status,
          output: t.output,
          usage: t.usage,
          timing: t.timing,
        }));
      try {
        await writeFile(
          path.join(dir, 'report.html'),
          await agent.reportHTMLString({ inlineScreenshots: true }),
        );
      } catch (e) {
        error = [error, `Report: ${e.message}`].filter(Boolean).join('; ');
      }
      try {
        await agent.destroy();
      } catch (e) {
        error = [error, `Cleanup: ${e.message}`].filter(Boolean).join('; ');
      }
    }
    if (track !== 'oracle')
      final = await page.evaluate(() => window.snapshot()).catch(() => null);
    await context.close();
  }
  const scrolls = actions.filter((a) => a.name === 'Scroll');
  const wrongClicks = final?.clicks?.filter((c) => c === 'wrong').length || 0;
  const compliant =
    c.family === 'explicit'
      ? actions.length === 4 &&
        scrolls.length === 4 &&
        scrolls.every(
          (a) => a.param.direction === 'down' && a.param.distance === 100,
        )
      : c.family === 'boundary'
        ? actions.length === 1 &&
          actions.every(
            (a) => a.name === 'Scroll' && a.param.direction === 'down',
          )
        : wrongClicks === 0;
  const success =
    !error &&
    (track === 'oracle' ||
      (['explicit', 'boundary'].includes(c.family)
        ? compliant &&
          (c.family !== 'explicit' || Math.abs(final.y - initial.y - 400) <= 2)
        : final?.clicks.includes('target') && compliant));
  const record = {
    id,
    caseId: c.id,
    family: c.family,
    split: c.split,
    track,
    arm,
    rep,
    success,
    compliant,
    wrongClicks,
    error,
    prefix,

    durationMs: Date.now() - start,
    initial,
    final,
    actions,
    reviews,
    scrollEvidence,
    calls,
    usage,
    tokens: usage.reduce((s, u) => s + (u.total_tokens || 0), 0),
    noProgressScrolls: scrolls.filter(
      (a) => a.after && a.before.x === a.after.x && a.before.y === a.after.y,
    ).length,
  };
  if (track === 'oracle' && !success) oracleFailures++;
  await writeFile(
    path.join(dir, 'result.json'),
    JSON.stringify(record, null, 2),
  );
  await appendFile(
    path.join(out, 'results.jsonl'),
    `${JSON.stringify(record)}\n`,
  );
  console.log(
    `${id}: ${success ? 'PASS' : 'FAIL'} actions=${actions.length} reviews=${reviews.length} ${error || ''}`,
  );
}
let next = 0;
let oracleFailures = 0;
try {
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (!interruptedBy && next < jobs.length) await attempt(jobs[next++]);
    }),
  );
} finally {
  await browser.close();
}

if (interruptedBy) {
  await writeFile(
    path.join(out, 'interruption.json'),
    JSON.stringify(
      {
        signal: interruptedBy,
        scheduled: jobs.length,
        started: next,
        note: 'Incomplete run: retain all completed/aborted attempts; do not treat unstarted jobs as completed.',
      },
      null,
      2,
    ),
  );
  process.exitCode = 130;
} else if (oracleFailures) process.exitCode = 1;
