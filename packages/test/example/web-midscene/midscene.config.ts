import { defineNode } from '@midscene/test';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { PlaywrightAgent } from '@midscene/web/playwright';
import { type Browser, type Page, chromium } from 'playwright';

const VIEWPORT = { width: 1280, height: 768 };
const LANGUAGE_LOCALES = {
  en: 'en-US',
  zh: 'zh-CN',
};

interface ProjectContext {
  browser: Browser;
  page: Page;
  agent?: PlaywrightAgent;
}

interface SetLanguageInput {
  language: keyof typeof LANGUAGE_LOCALES;
}

interface PageState {
  language: string;
  title: string;
  url: string;
}

const openPage = async (page: Page, url: string) => {
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });

  if (!response?.ok()) {
    throw new Error(
      `Page returned an unsuccessful HTTP status: ${response?.status() ?? 'no response'}`,
    );
  }
};

const setUserAgentLanguage = defineNode<
  SetLanguageInput,
  { language: string; locale: string; url: string },
  ProjectContext
>({
  name: 'browser.setLanguage',
  title: '设置 UA 语言',
  async execute({ input, context }) {
    const language = input.language;
    if (language !== 'en' && language !== 'zh') {
      throw new TypeError(
        'browser.setLanguage language must be either "en" or "zh".',
      );
    }
    const locale = LANGUAGE_LOCALES[language];

    const previousPage = context.page;
    const previousBrowserContext = previousPage.context();
    const browserContext = await context.browser.newContext({
      locale,
      viewport: VIEWPORT,
    });
    const page = await browserContext.newPage();

    try {
      await openPage(page, previousPage.url());
      await page.waitForFunction(
        (expectedLanguage) =>
          document.documentElement.lang === expectedLanguage,
        language,
        { timeout: 10_000 },
      );
    } catch (error) {
      await browserContext.close();
      throw error;
    }

    context.page = page;
    context.agent = undefined;
    await previousBrowserContext.close();

    return {
      summary: `Set UA language to ${language}`,
      data: {
        language,
        locale,
        url: page.url(),
      },
    };
  },
});

const recordPageState = defineNode<unknown, PageState, ProjectContext>({
  name: 'page.recordState',
  title: '记录页面状态',
  async execute({ context }) {
    const state = {
      language: await context.page.evaluate(() => navigator.language),
      title: await context.page.title(),
      url: context.page.url(),
    };
    return {
      summary: `${state.title} (${state.url})`,
      data: state,
    };
  },
});

const midsceneNodes = createMidsceneNodes<ProjectContext>({
  getAgent: ({ context }) => {
    context.agent ??= new PlaywrightAgent(context.page);
    return context.agent;
  },
  includeLaunch: false,
});

const playwrightSetup = defineProjectSetup<ProjectContext>({
  name: 'playwright',
  platform: 'web',
  async setup({ onTeardown }) {
    const browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    onTeardown(() => browser.close());
    const browserContext = await browser.newContext({
      viewport: VIEWPORT,
    });
    const page = await browserContext.newPage();
    const context: ProjectContext = { browser, page };
    onTeardown(() => context.page.context().close());
    await openPage(page, 'https://midscenejs.com');
    return context;
  },
});

export default defineTestProject<ProjectContext>({
  projects: [
    {
      name: 'web',
      platform: 'web',
      files: { include: ['midscene.yaml'] },
      setup: playwrightSetup,
    },
  ],
  nodes: [setUserAgentLanguage, recordPageState, ...midsceneNodes],
});
