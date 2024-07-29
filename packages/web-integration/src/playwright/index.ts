import { randomUUID } from 'crypto';
import { TestInfo, TestType } from '@playwright/test';
import { writeDumpFile } from '@midscene/core/utils';
import { PageTaskExecutor } from '../common/tasks';
import { WebPage } from '@/common/page';
import { PageAgent } from '@/common/agent';

export type APITestType = Pick<TestType<any, any>, 'step'>;

const groupAndCaseForTest = (testInfo: TestInfo) => {
  let taskFile: string;
  let taskTitle: string;
  const titlePath = [...testInfo.titlePath];

  if (titlePath.length > 1) {
    taskTitle = titlePath.pop()!;
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

const midSceneAgentKeyId = '_midSceneAgentId';
export const PlaywrightAiFixture = () => {
  const pageAgentMap: Record<string, PageAgent> = {};
  const agentForPage = (page: WebPage, opts: { testId: string; taskFile: string; taskTitle: string }) => {
    let idForPage = (page as any)[midSceneAgentKeyId];
    if (!idForPage) {
      idForPage = randomUUID();
      (page as any)[midSceneAgentKeyId] = idForPage;
      pageAgentMap[idForPage] = new PageAgent(page, {
        testId: `${opts.testId}-${idForPage}`,
        taskFile: opts.taskFile,
        taskTitle: opts.taskTitle,
      });
    }
    return pageAgentMap[idForPage];
  };

  return {
    ai: async ({ page }: any, use: any, testInfo: TestInfo) => {
      const { taskFile, taskTitle } = groupAndCaseForTest(testInfo);
      const agent = agentForPage(page, { testId: testInfo.testId, taskFile, taskTitle });
      await use(async (taskPrompt: string, opts?: { type?: 'action' | 'query' }) => {
        const actionType = opts?.type || 'action';
        const result = await agent.ai(taskPrompt, actionType);
        return result;
      });
      const taskCacheJson = agent.actionAgent.taskCache.generateTaskCache();
      writeDumpFile({
        fileName: `${taskCacheJson.taskFile}(${taskCacheJson.taskTitle})`,
        fileExt: 'json',
        fileContent: JSON.stringify(taskCacheJson),
        type: 'cache',
      });
      // console.log('cache content', JSON.stringify(agent.actionAgent.taskCache.generateTaskCache()));
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
    aiAction: async ({ page }: any, use: any, testInfo: TestInfo) => {
      const { taskFile, taskTitle } = groupAndCaseForTest(testInfo);
      const agent = agentForPage(page, { testId: testInfo.testId, taskFile, taskTitle });
      await use(async (taskPrompt: string) => {
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
    aiQuery: async ({ page }: any, use: any, testInfo: TestInfo) => {
      const { taskFile, taskTitle } = groupAndCaseForTest(testInfo);
      const agent = agentForPage(page, { testId: testInfo.testId, taskFile, taskTitle });
      await use(async function (demand: any) {
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
  };
};

export type PlayWrightAiFixtureType = {
  ai: <T = any>(prompt: string, opts?: { type?: 'action' | 'query' }) => Promise<T>;
  aiAction: (taskPrompt: string) => ReturnType<PageTaskExecutor['action']>;
  aiQuery: <T = any>(demand: any) => Promise<T>;
};
