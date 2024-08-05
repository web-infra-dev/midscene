import { randomUUID } from 'node:crypto';
import { PageAgent } from '@/common/agent';
import type { WebPage } from '@/common/page';
import type { TestInfo, TestType } from '@playwright/test';
import type { Page as PlaywrightPage } from 'playwright';
import type { PageTaskExecutor } from '../common/tasks';
import { readTestCache, writeTestCache } from './cache';

export type APITestType = Pick<TestType<any, any>, 'step'>;

const groupAndCaseForTest = (testInfo: TestInfo) => {
  let taskFile: string;
  let taskTitle: string;
  const titlePath = [...testInfo.titlePath];

  if (titlePath.length > 1) {
    taskTitle = titlePath.pop() || 'unnamed';
    taskFile = `${titlePath.join(' > ')}:${testInfo.line}`;
  } else if (titlePath.length === 1) {
    taskTitle = titlePath[0];
    taskFile = `${taskTitle}:${testInfo.line}`;
  } else {
    taskTitle = 'unnamed';
    taskFile = 'unnamed';
  }
  return { taskFile, taskTitle };
};

const midsceneAgentKeyId = '_midsceneAgentId';
export const PlaywrightAiFixture = () => {
  const pageAgentMap: Record<string, PageAgent> = {};
  const agentForPage = (
    page: WebPage,
    opts: { testId: string; taskFile: string; taskTitle: string },
  ) => {
    let idForPage = (page as any)[midsceneAgentKeyId];
    if (!idForPage) {
      idForPage = randomUUID();
      (page as any)[midsceneAgentKeyId] = idForPage;
      const testCase = readTestCache(opts.taskFile, opts.taskTitle) || {
        aiTasks: [],
      };
      pageAgentMap[idForPage] = new PageAgent(page, {
        testId: `${opts.testId}-${idForPage}`,
        taskFile: opts.taskFile,
        cache: testCase,
      });
    }
    return pageAgentMap[idForPage];
  };

  return {
    ai: async (
      { page }: { page: PlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      const { taskFile, taskTitle } = groupAndCaseForTest(testInfo);
      const agent = agentForPage(page, {
        testId: testInfo.testId,
        taskFile,
        taskTitle,
      });
      await use(
        async (taskPrompt: string, opts?: { type?: 'action' | 'query' }) => {
          await page.waitForLoadState('networkidle');
          const actionType = opts?.type || 'action';
          const result = await agent.ai(taskPrompt, actionType);
          return result;
        },
      );
      const taskCacheJson = agent.taskExecutor.taskCache.generateTaskCache();
      writeTestCache(taskFile, taskTitle, taskCacheJson);
      if (agent.dumpFile) {
        testInfo.annotations.push({
          type: 'MIDSCENE_AI_ACTION',
          description: JSON.stringify({
            testId: testInfo.testId,
            dumpPath: agent.dumpFile,
          }),
        });
      }
    },
    aiAction: async (
      { page }: { page: PlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      const { taskFile, taskTitle } = groupAndCaseForTest(testInfo);
      const agent = agentForPage(page, {
        testId: testInfo.testId,
        taskFile,
        taskTitle,
      });
      await use(async (taskPrompt: string) => {
        await page.waitForLoadState('networkidle');
        await agent.aiAction(taskPrompt);
      });
      if (agent.dumpFile) {
        testInfo.annotations.push({
          type: 'MIDSCENE_AI_ACTION',
          description: JSON.stringify({
            testId: testInfo.testId,
            dumpPath: agent.dumpFile,
          }),
        });
      }
    },
    aiQuery: async (
      { page }: { page: PlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      const { taskFile, taskTitle } = groupAndCaseForTest(testInfo);
      const agent = agentForPage(page, {
        testId: testInfo.testId,
        taskFile,
        taskTitle,
      });
      await use(async (demand: any) => {
        await page.waitForLoadState('networkidle');
        const result = await agent.aiQuery(demand);
        return result;
      });
      if (agent.dumpFile) {
        testInfo.annotations.push({
          type: 'MIDSCENE_AI_ACTION',
          description: JSON.stringify({
            testId: testInfo.testId,
            dumpPath: agent.dumpFile,
          }),
        });
      }
    },
    aiAssert: async (
      { page }: { page: PlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      const { taskFile, taskTitle } = groupAndCaseForTest(testInfo);
      const agent = agentForPage(page, {
        testId: testInfo.testId,
        taskFile,
        taskTitle,
      });
      await use(async (assertion: string, errorMsg?: string) => {
        await page.waitForLoadState('networkidle');
        await agent.aiAssert(assertion, errorMsg);
      });
      if (agent.dumpFile) {
        testInfo.annotations.push({
          type: 'MIDSCENE_AI_ACTION',
          description: JSON.stringify({
            testId: testInfo.testId,
            dumpPath: agent.dumpFile,
          }),
        });
      }
    },
  };
};

export type PlayWrightAiFixtureType = {
  ai: <T = any>(
    prompt: string,
    opts?: { type?: 'action' | 'query' },
  ) => Promise<T>;
  aiAction: (taskPrompt: string) => ReturnType<PageTaskExecutor['action']>;
  aiQuery: <T = any>(demand: any) => Promise<T>;
  aiAssert: (assertion: string, errorMsg?: string) => Promise<void>;
};
