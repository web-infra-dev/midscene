import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import type { Page } from 'puppeteer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 10 * 60 * 1000,
});

const TODO_MVC_URL = 'https://todomvc.com/examples/react/dist/';
const TODO_ITEMS = [
  'Learn JS today',
  'Learn Rust tomorrow',
  'Learning AI the day after tomorrow',
] as const;

async function runTodoMvcFlow(agent: PuppeteerAgent) {
  await agent.aiHover('the "Learn Rust tomorrow" todo item');
  await agent.aiTap(
    'the delete button for the "Learn Rust tomorrow" todo item',
  );
  await agent.aiTap(
    'the checkbox for the "Learning AI the day after tomorrow" todo item',
  );
  await agent.aiTap('the "Completed" filter below the todo list');
}

async function seedTodoMvc(page: Page) {
  const input = await page.waitForSelector<HTMLInputElement>('.new-todo');
  if (!input) {
    throw new Error('TodoMVC input was not found');
  }

  for (const item of TODO_ITEMS) {
    await input.type(item);
    await input.press('Enter');
  }

  await page.waitForFunction(
    (expectedCount) =>
      document.querySelectorAll('.todo-list li').length === expectedCount,
    {},
    TODO_ITEMS.length,
  );
}

async function resetAndSeedTodoMvc(page: Page) {
  await page.evaluate(() => localStorage.clear());
  await page.goto(TODO_MVC_URL, { waitUntil: 'domcontentloaded' });
  await seedTodoMvc(page);
}

async function readTodoMvcState(page: Page) {
  return page.evaluate(() => {
    const visibleTodos = Array.from(
      document.querySelectorAll<HTMLLIElement>('.todo-list li'),
    )
      .filter((item) => getComputedStyle(item).display !== 'none')
      .map((item) => ({
        completed: item.classList.contains('completed'),
        text: item.querySelector('label')?.textContent?.trim(),
      }));

    return {
      selectedFilter: document
        .querySelector('.filters a.selected')
        ?.textContent?.trim(),
      visibleTodos,
    };
  });
}

function tokenDelta(cacheVerified: number, noCache: number) {
  return {
    absolute: cacheVerified - noCache,
    percent: noCache
      ? Number((((cacheVerified - noCache) / noCache) * 100).toFixed(2))
      : null,
  };
}

type TodoMvcBenchmarkMode = 'cached-with-verify' | 'no-cache';

function todoMvcBenchmarkOrder(): TodoMvcBenchmarkMode[] {
  const order =
    process.env.MIDSCENE_CACHE_VERIFY_BENCHMARK_ORDER ?? 'cached-first';
  if (order === 'cached-first') {
    return ['cached-with-verify', 'no-cache'];
  }
  if (order === 'no-cache-first') {
    return ['no-cache', 'cached-with-verify'];
  }
  throw new Error(
    `Unsupported MIDSCENE_CACHE_VERIFY_BENCHMARK_ORDER: ${order}`,
  );
}

describe('cached action effect verification', () => {
  const agents: PuppeteerAgent[] = [];
  let resetPage: (() => Promise<void>) | undefined;
  let cacheDir: string | undefined;

  afterEach(async () => {
    for (const agent of agents.reverse()) {
      await agent.destroy();
    }
    agents.length = 0;
    await resetPage?.();
    if (cacheDir) {
      rmSync(cacheDir, { force: true, recursive: true });
    }
  });

  it('uses AI to confirm that a cached tap focused the input', async () => {
    const { originPage, reset } = await launchPage('about:blank');
    resetPage = reset;
    cacheDir = mkdtempSync(join(tmpdir(), 'midscene-cache-verification-'));

    await originPage.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              font-family: Arial, sans-serif;
              background: #f4f6f8;
            }
            main {
              width: 520px;
              padding: 40px;
              background: white;
              border: 1px solid #d8dde3;
              border-radius: 8px;
            }
            label {
              display: block;
              margin-bottom: 12px;
              font-size: 20px;
              font-weight: 700;
            }
            input {
              box-sizing: border-box;
              width: 100%;
              padding: 16px;
              border: 3px solid #8a949e;
              border-radius: 6px;
              font-size: 20px;
              outline: none;
            }
            input:focus {
              border-color: #087f5b;
              box-shadow: 0 0 0 5px #b2f2df;
            }
            #status {
              margin-top: 24px;
              padding: 14px;
              border-radius: 6px;
              background: #eceff1;
              color: #495057;
              font-size: 18px;
              font-weight: 700;
            }
            #status.active {
              background: #d3f9d8;
              color: #087f5b;
            }
          </style>
        </head>
        <body>
          <main>
            <label for="account">Account name</label>
            <input id="account" aria-label="Account name" placeholder="Click to activate" />
            <div id="status">Input is inactive</div>
          </main>
          <script>
            const input = document.querySelector('#account');
            const status = document.querySelector('#status');
            input.addEventListener('focus', () => {
              status.textContent = 'Input is active';
              status.className = 'active';
            });
            input.addEventListener('blur', () => {
              status.textContent = 'Input is inactive';
              status.className = '';
            });
          </script>
        </body>
      </html>
    `);

    const reportFileName = `cache-action-verification-${Date.now()}`;
    const cache = {
      id: reportFileName,
      cacheDir,
    };
    const cacheWriter = new PuppeteerAgent(originPage, {
      cache: {
        ...cache,
        strategy: 'write-only',
      },
      generateReport: false,
    });
    agents.push(cacheWriter);

    await cacheWriter.aiTap('the Account name input');
    expect(cacheWriter.taskCache?.cacheFilePath).toBeTruthy();

    const cacheReader = new PuppeteerAgent(originPage, {
      cache: {
        ...cache,
        strategy: 'read-only',
      },
      generateReport: true,
      reportFileName,
    });
    agents.push(cacheReader);

    await originPage.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });

    expect(
      await originPage.$eval('#status', (element) => element.textContent),
    ).toBe('Input is inactive');

    await cacheReader.aiTap('the Account name input');

    const browserState = await originPage.evaluate(() => ({
      activeElementId: document.activeElement?.id,
      status: document.querySelector('#status')?.textContent,
    }));
    const allTasks = cacheReader.dump.executions.flatMap(
      (execution) => execution.tasks,
    );
    const cachedLocate = allTasks.find((task) => task.hitBy?.from === 'Cache');
    const verification = allTasks.find(
      (task) => task.cacheActionVerification,
    )?.cacheActionVerification;

    expect(cachedLocate).toBeDefined();
    expect(browserState).toEqual({
      activeElementId: 'account',
      status: 'Input is active',
    });
    expect(verification).toMatchObject({
      status: 'passed',
      request: {
        actionName: 'Tap',
        targetDescription: 'the Account name input',
        logicalModelRequestCount: 1,
        screenshotCount: 2,
      },
    });
    expect(cacheReader.reportFile).toBeTruthy();

    console.log(
      'Cached action verification result:',
      JSON.stringify({ browserState, verification }),
    );
    console.log('Report:', cacheReader.reportFile);
  });

  it('verifies multiple cached taps in a TodoMVC workflow', async () => {
    const executionOrder = todoMvcBenchmarkOrder();
    const { originPage, reset } = await launchPage(TODO_MVC_URL);
    resetPage = reset;
    cacheDir = mkdtempSync(join(tmpdir(), 'midscene-todomvc-verification-'));

    await resetAndSeedTodoMvc(originPage);

    const reportFileName = `todomvc-cache-action-verification-${Date.now()}`;
    const cache = {
      id: reportFileName,
      cacheDir,
    };
    const cacheWriter = new PuppeteerAgent(originPage, {
      cache: {
        ...cache,
        strategy: 'write-only',
      },
      generateReport: false,
    });
    agents.push(cacheWriter);

    await runTodoMvcFlow(cacheWriter);
    expect(cacheWriter.taskCache?.cacheFilePath).toBeTruthy();

    const cacheReader = new PuppeteerAgent(originPage, {
      cache: {
        ...cache,
        strategy: 'read-only',
      },
      generateReport: true,
      reportFileName,
    });
    agents.push(cacheReader);

    const noCacheAgent = new PuppeteerAgent(originPage, {
      cache: false,
      generateReport: true,
      reportFileName: `${reportFileName}-no-cache`,
    });
    agents.push(noCacheAgent);

    const measuredRuns = new Map<
      TodoMvcBenchmarkMode,
      {
        wallTimeMs: number;
        browserState: Awaited<ReturnType<typeof readTodoMvcState>>;
      }
    >();
    for (const mode of executionOrder) {
      await resetAndSeedTodoMvc(originPage);
      const agent = mode === 'cached-with-verify' ? cacheReader : noCacheAgent;
      const startTime = performance.now();
      await runTodoMvcFlow(agent);
      measuredRuns.set(mode, {
        wallTimeMs: Math.round(performance.now() - startTime),
        browserState: await readTodoMvcState(originPage),
      });
    }

    const cacheVerifiedRun = measuredRuns.get('cached-with-verify');
    const noCacheRun = measuredRuns.get('no-cache');
    if (!cacheVerifiedRun || !noCacheRun) {
      throw new Error('TodoMVC benchmark did not execute both modes');
    }

    const browserState = cacheVerifiedRun.browserState;
    const allTasks = cacheReader.dump.executions.flatMap(
      (execution) => execution.tasks,
    );
    const cachedTasks = allTasks.filter((task) => task.hitBy?.from === 'Cache');
    const verificationTasks = allTasks.filter(
      (task) => task.cacheActionVerification,
    );
    const verifications = verificationTasks.map((task) => ({
      action: task.type,
      ...task.cacheActionVerification,
    }));

    expect(cachedTasks.length).toBeGreaterThanOrEqual(4);
    expect(verifications).toHaveLength(3);
    expect(verifications.every(({ status }) => status === 'passed')).toBe(true);
    expect(
      verificationTasks.every(
        (task) =>
          task.cacheActionVerificationImages?.length === 1 &&
          task.cacheActionVerificationImages[0].requestIndex === 1 &&
          task.cacheActionVerificationImages[0].role === 'focused-comparison',
      ),
    ).toBe(true);
    expect(
      verifications.map(({ request }) => ({
        actionName: request?.actionName,
        logicalModelRequestCount: request?.logicalModelRequestCount,
        screenshotCount: request?.screenshotCount,
        modelInputImageCount: request?.modelInputImageCount,
        verificationMode: request?.verificationMode,
        targetDescription: request?.targetDescription,
      })),
    ).toEqual([
      {
        actionName: 'Tap',
        logicalModelRequestCount: 1,
        screenshotCount: 2,
        modelInputImageCount: 1,
        verificationMode: 'focused-comparison',
        targetDescription:
          'the delete button for the "Learn Rust tomorrow" todo item',
      },
      {
        actionName: 'Tap',
        logicalModelRequestCount: 1,
        screenshotCount: 2,
        modelInputImageCount: 1,
        verificationMode: 'focused-comparison',
        targetDescription:
          'the checkbox for the "Learning AI the day after tomorrow" todo item',
      },
      {
        actionName: 'Tap',
        logicalModelRequestCount: 1,
        screenshotCount: 2,
        modelInputImageCount: 1,
        verificationMode: 'focused-comparison',
        targetDescription: 'the "Completed" filter below the todo list',
      },
    ]);
    expect(
      verifications.every(({ request }) => {
        if (!request) {
          return false;
        }
        return request.dataDemand.status.includes(request.targetDescription);
      }),
    ).toBe(true);
    expect(browserState).toEqual({
      selectedFilter: 'Completed',
      visibleTodos: [
        {
          completed: true,
          text: 'Learning AI the day after tomorrow',
        },
      ],
    });
    expect(cacheReader.reportFile).toBeTruthy();

    const cacheVerifiedMetrics = cacheReader.metrics;
    expect(cacheVerifiedMetrics.calls).toBe(3);
    expect(cacheVerifiedMetrics.totalTokens).toBeGreaterThan(0);

    expect(noCacheRun.browserState).toEqual(browserState);
    expect(noCacheAgent.reportFile).toBeTruthy();

    const noCacheMetrics = noCacheAgent.metrics;
    expect(noCacheMetrics.calls).toBeGreaterThanOrEqual(4);
    expect(noCacheMetrics.totalTokens).toBeGreaterThan(0);

    const tokenComparison = {
      methodology:
        'Same TodoMVC state and action flow. Cache warm-up usage is excluded. Run order is configurable and recorded. cachedWithVerify uses read-only cache with default action verification; noCache uses cache: false.',
      executionOrder,
      cachedWithVerify: {
        reportFile: cacheReader.reportFile,
        wallTimeMs: cacheVerifiedRun.wallTimeMs,
        verificationModes: verifications.map(
          ({ request }) => request?.verificationMode,
        ),
        fallbackCount: verifications.filter(
          ({ request }) => request?.fallbackReason,
        ).length,
        ...cacheVerifiedMetrics,
      },
      noCache: {
        reportFile: noCacheAgent.reportFile,
        wallTimeMs: noCacheRun.wallTimeMs,
        ...noCacheMetrics,
      },
      cachedWithVerifyMinusNoCache: {
        promptTokens: tokenDelta(
          cacheVerifiedMetrics.totalPromptTokens,
          noCacheMetrics.totalPromptTokens,
        ),
        completionTokens: tokenDelta(
          cacheVerifiedMetrics.totalCompletionTokens,
          noCacheMetrics.totalCompletionTokens,
        ),
        totalTokens: tokenDelta(
          cacheVerifiedMetrics.totalTokens,
          noCacheMetrics.totalTokens,
        ),
        modelTimeMs: tokenDelta(
          cacheVerifiedMetrics.totalTimeCostMs,
          noCacheMetrics.totalTimeCostMs,
        ),
        wallTimeMs: tokenDelta(
          cacheVerifiedRun.wallTimeMs,
          noCacheRun.wallTimeMs,
        ),
        calls: cacheVerifiedMetrics.calls - noCacheMetrics.calls,
      },
    };

    const cacheVerifiedReportFile = cacheReader.reportFile;
    if (!cacheVerifiedReportFile) {
      throw new Error('Cached verification report was not generated');
    }
    const tokenComparisonFile = join(
      dirname(cacheVerifiedReportFile),
      `${reportFileName}-token-comparison.json`,
    );
    writeFileSync(
      tokenComparisonFile,
      `${JSON.stringify(tokenComparison, null, 2)}\n`,
      'utf8',
    );

    console.log(
      'TodoMVC cached action verification result:',
      JSON.stringify({
        browserState,
        cachedTaskCount: cachedTasks.length,
        verifications,
      }),
    );
    console.log('Report:', cacheReader.reportFile);
    console.log('TodoMVC token comparison:', JSON.stringify(tokenComparison));
    console.log('Token comparison report:', tokenComparisonFile);
  });
});
