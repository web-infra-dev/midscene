import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnvText } from '../src/renderer/components/ShellLayout/connectivity-env';
import { resolveModelConnection } from '../src/shared/model-connection';

const EVALUATION_HOME_URL =
  'https://ads.tiktok.com/i18n/dashboard?aadvid=6961659021690470401';
const EVALUATION_ORIGIN = new URL(EVALUATION_HOME_URL).origin;
const DEFAULT_KNOWLEDGE_PATH =
  '/Users/bytedance/studio/midscene/apps/studio/tests/knownledge/v3/index.md';
const DEFAULT_MODEL_ENV_PATH = fileURLToPath(
  new URL('../../../.env', import.meta.url),
);
const DEFAULT_CDP_ENDPOINT = 'http://127.0.0.1:9222';
const VIEWPORT = {
  width: 1920,
  height: 1080,
};
const PAGE_READY_TIMEOUT_MS = 2 * 60 * 1000;
const LOGIN_READY_TIMEOUT_MS = 5 * 60 * 1000;
const PAGE_SETTLE_TIME_MS = 3 * 1000;
const TEST_TIMEOUT_MS = 15 * 60 * 1000;

type EvaluationCase = {
  id: string;
  title: string;
  prompt: string;
  useKnowledge: boolean;
};

const EVALUATION_CASES: EvaluationCase[] = [
  {
    id: '01-melanoma',
    title: '创建TikTok Ads销售广告系列 / no context',
    prompt: '创建一条 TikTok Ads销售广告，入口为 create ad 按钮。',
    useKnowledge: false,
  },
  {
    id: '02-melanoma',
    title: '创建一条 TikTok Ads销售广告系列 / transferred knowledge context',
    prompt: '创建一条 TikTok Ads销售广告，入口为 create ad 按钮。',
    useKnowledge: true,
  },
];

const shouldRunEvaluation = process.env.MIDSCENE_RUN_KNOWLEDGE_AB_EVAL === '1';

let browser: Browser | undefined;
let knowledge = '';

async function loadEvaluationEnv(): Promise<void> {
  const modelEnvPath =
    process.env.MIDSCENE_KNOWLEDGE_AB_MODEL_ENV_PATH || DEFAULT_MODEL_ENV_PATH;
  let modelEnvText: string | undefined;
  try {
    modelEnvText = await readFile(modelEnvPath, 'utf8');
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code;
    if (
      errorCode !== 'ENOENT' ||
      process.env.MIDSCENE_KNOWLEDGE_AB_MODEL_ENV_PATH
    ) {
      throw new Error(`Failed to read model env file: ${modelEnvPath}`, {
        cause: error,
      });
    }
  }

  if (modelEnvText !== undefined) {
    for (const [key, value] of Object.entries(parseEnvText(modelEnvText))) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }

  const loadedConfig = resolveModelConnection(process.env);
  if ('error' in loadedConfig) {
    throw new Error(
      `Invalid Midscene model config: ${loadedConfig.error}. Configure shell environment variables or ${modelEnvPath}.`,
    );
  }
}

async function connectEvaluationBrowser(): Promise<Browser> {
  const cdpEndpoint =
    process.env.MIDSCENE_KNOWLEDGE_AB_CDP_ENDPOINT?.trim() ||
    DEFAULT_CDP_ENDPOINT;
  try {
    if (/^wss?:\/\//i.test(cdpEndpoint)) {
      return await puppeteer.connect({ browserWSEndpoint: cdpEndpoint });
    }
    return await puppeteer.connect({ browserURL: cdpEndpoint });
  } catch (error) {
    throw new Error(
      `Failed to connect to the existing browser at ${cdpEndpoint}. Start Chrome with a remote debugging port or set MIDSCENE_KNOWLEDGE_AB_CDP_ENDPOINT.`,
      { cause: error },
    );
  }
}

async function waitForEvaluationOrigin(
  page: Page,
  timeout: number,
): Promise<void> {
  await page.waitForFunction(
    (expectedOrigin) => window.location.origin === expectedOrigin,
    { timeout },
    EVALUATION_ORIGIN,
  );
}

async function openEvaluationPage(
  page: Page,
  readyTimeout: number,
): Promise<void> {
  await page.setViewport(VIEWPORT);
  await page.goto(EVALUATION_HOME_URL, {
    waitUntil: 'domcontentloaded',
    timeout: PAGE_READY_TIMEOUT_MS,
  });
  await waitForEvaluationOrigin(page, readyTimeout);
  await sleep(PAGE_SETTLE_TIME_MS);
}

describe.skipIf(!shouldRunEvaluation)('Knowledge effect A/B evaluation', () => {
  beforeAll(async () => {
    await loadEvaluationEnv();

    const knowledgePath =
      process.env.MIDSCENE_KNOWLEDGE_AB_KNOWLEDGE_PATH ||
      DEFAULT_KNOWLEDGE_PATH;
    knowledge = await readFile(knowledgePath, 'utf8');
    if (!knowledge.trim()) {
      throw new Error(`Knowledge file is empty: ${knowledgePath}`);
    }

    browser = await connectEvaluationBrowser();

    const loginPage = await browser.newPage();
    try {
      await openEvaluationPage(loginPage, LOGIN_READY_TIMEOUT_MS);
    } finally {
      await loginPage.close();
    }
  }, LOGIN_READY_TIMEOUT_MS + PAGE_READY_TIMEOUT_MS);

  afterAll(async () => {
    browser?.disconnect();
  });

  it.each(EVALUATION_CASES)(
    '$id: $title',
    async (evaluationCase) => {
      if (!browser) {
        throw new Error('Knowledge A/B evaluation browser was not initialized');
      }

      const page = await browser.newPage();
      const agent = new PuppeteerAgent(page, {
        cache: false,
        generateReport: true,
        persistExecutionDump: true,
        outputFormat: 'html-and-external-assets',
        groupName: `Knowledge A/B evaluation: ${evaluationCase.title}`,
        groupDescription:
          'Run exactly one aiAct call on the target site to compare knowledge-context effectiveness.',
        reportFileName: `knowledge-ab-${evaluationCase.id}`,
      });

      try {
        await openEvaluationPage(page, PAGE_READY_TIMEOUT_MS);

        if (evaluationCase.useKnowledge) {
          await agent.aiAct(evaluationCase.prompt, { context: knowledge });
        } else {
          await agent.aiAct(evaluationCase.prompt);
        }

        expect(agent.reportFile).toBeTruthy();
      } finally {
        await agent.destroy();
        await page.close();
      }
    },
    TEST_TIMEOUT_MS,
  );
});
