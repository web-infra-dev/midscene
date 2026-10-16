import { fileURLToPath } from 'node:url';
import type { NodeExecutionContext } from '@midscene/test';
import {
  defineFileSetup,
  defineProjectSetup,
  defineTestProject,
} from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { PlaywrightAgent } from '@midscene/web/playwright/agent';
import { config as loadEnv } from 'dotenv';
import { type Browser, type Page, chromium } from 'playwright';
import { createTodoNodes } from './nodes/todo';

loadEnv({ path: fileURLToPath(new URL('.env', import.meta.url)) });

interface FileContext {
  page: Page;
  agent?: PlaywrightAgent;
}

interface ProjectContext {
  browser: Browser;
}

const getAgent = ({ context }: NodeExecutionContext<unknown, FileContext>) => {
  context.agent ??= new PlaywrightAgent(context.page);
  return context.agent;
};

const setup = defineProjectSetup<ProjectContext>({
  name: 'web',
  async setup({ env, onTeardown }) {
    const browser = await chromium.launch({
      headless: env.HEADLESS !== 'false',
    });
    onTeardown(() => browser.close());
    return { browser };
  },
});

const fileSetup = defineFileSetup<FileContext, ProjectContext>({
  name: 'web-file',
  async setup({ projectContext, signal, onTeardown }) {
    if (!projectContext)
      throw new Error('Web Project setup did not create a browser.');
    const browserContext = await projectContext.browser.newContext();
    onTeardown(() => browserContext.close());
    signal.throwIfAborted();
    const page = await browserContext.newPage();
    const context: FileContext = { page };
    onTeardown(async () => {
      await context.agent?.destroy();
    });
    return context;
  },
});

export default defineTestProject<FileContext, ProjectContext>({
  projects: [
    {
      name: 'web',
      setup,
      fileSetup,
      files: { include: ['cases/**/*.{yaml,yml}'] },
    },
  ],
  nodes: [
    ...createTodoNodes<FileContext>({ getPage: (context) => context.page }),
    ...createMidsceneNodes<FileContext>({
      agentClass: PlaywrightAgent,
      getAgent,
    }),
  ],
  test: { maxConcurrentFiles: 1, bail: 1, testTimeout: 600_000 },
});
