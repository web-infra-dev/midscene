import { fileURLToPath } from 'node:url';
import type { NodeExecutionContext } from '@midscene/test';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { PlaywrightAgent } from '@midscene/web/playwright/agent';
import { config as loadEnv } from 'dotenv';
import { type Page, chromium } from 'playwright';
import { createTodoNodes } from './nodes/todo';

loadEnv({ path: fileURLToPath(new URL('.env', import.meta.url)) });

interface ProjectContext {
  page: Page;
  agent?: PlaywrightAgent;
}

const getAgent = ({
  context,
}: NodeExecutionContext<unknown, ProjectContext>) => {
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
    const page = await browser.newPage();
    const context: ProjectContext = { page };
    onTeardown(async () => {
      await context.agent?.destroy();
    });
    return context;
  },
});

export default defineTestProject<ProjectContext>({
  projects: [
    {
      name: 'web',
      setup,
      files: { include: ['cases/**/*.{yaml,yml}'] },
    },
  ],
  nodes: [
    ...createTodoNodes<ProjectContext>({ getPage: (context) => context.page }),
    ...createMidsceneNodes<ProjectContext>({
      agentClass: PlaywrightAgent,
      getAgent,
    }),
  ],
  test: { testTimeout: 240_000 },
});
