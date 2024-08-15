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
    taskFile = `${titlePath.join(' > ')}`;
  } else if (titlePath.length === 1) {
    taskTitle = titlePath[0];
    taskFile = `${taskTitle}`;
  } else {
    taskTitle = 'unnamed';
    taskFile = 'unnamed';
  }
  return { taskFile, taskTitle };
};

const midsceneAgentKeyId = '_midsceneAgentId';
export const midsceneDumpAnnotationId = 'MIDSCENE_DUMP_ANNOTATION';
export const PlaywrightAiFixture = () => {
  const pageAgentMap: Record<string, PageAgent> = {};
  const agentForPage = (
    page: WebPage,
    testInfo: TestInfo, // { testId: string; taskFile: string; taskTitle: string },
  ) => {
    let idForPage = (page as any)[midsceneAgentKeyId];
    if (!idForPage) {
      idForPage = randomUUID();
      (page as any)[midsceneAgentKeyId] = idForPage;
      const { testId } = testInfo;
      const { taskFile, taskTitle } = groupAndCaseForTest(testInfo);
      const testCase = readTestCache(taskFile, taskTitle) || {
        aiTasks: [],
      };

      pageAgentMap[idForPage] = new PageAgent(page, {
        testId: `playwright-${testId}-${idForPage}`,
        groupName: taskTitle,
        groupDescription: taskFile,
        cache: testCase,
        generateReport: false, // we will generate it in the reporter
      });
    }
    return pageAgentMap[idForPage];
  };

  const updateDumpAnnotation = (test: TestInfo, dump: string) => {
    const currentAnnotation = test.annotations.find((item) => {
      return item.type === midsceneDumpAnnotationId;
    });
    if (currentAnnotation) {
      currentAnnotation.description = dump;
    } else {
      test.annotations.push({
        type: midsceneDumpAnnotationId,
        description: dump,
      });
    }
  };

  return {
    ai: async (
      { page }: { page: PlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      const { taskFile, taskTitle } = groupAndCaseForTest(testInfo);
      const agent = agentForPage(page, testInfo);
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
      updateDumpAnnotation(testInfo, agent.dumpDataString());
    },
    aiAction: async (
      { page }: { page: PlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      const { taskFile, taskTitle } = groupAndCaseForTest(testInfo);
      const agent = agentForPage(page, testInfo);
      await use(async (taskPrompt: string) => {
        await page.waitForLoadState('networkidle');
        await agent.aiAction(taskPrompt);
      });
      // Why there's no cache here ?
      updateDumpAnnotation(testInfo, agent.dumpDataString());
    },
    aiQuery: async (
      { page }: { page: PlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      const agent = agentForPage(page, testInfo);
      await use(async (demand: any) => {
        await page.waitForLoadState('networkidle');
        const result = await agent.aiQuery(demand);
        return result;
      });
      updateDumpAnnotation(testInfo, agent.dumpDataString());
    },
    aiAssert: async (
      { page }: { page: PlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      const agent = agentForPage(page, testInfo);
      await use(async (assertion: string, errorMsg?: string) => {
        await page.waitForLoadState('networkidle');
        await agent.aiAssert(assertion, errorMsg);
      });
      updateDumpAnnotation(testInfo, agent.dumpDataString());
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
