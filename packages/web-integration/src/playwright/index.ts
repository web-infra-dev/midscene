import { randomUUID } from 'crypto';
import { TestInfo, TestType } from '@playwright/test';
import { PageTaskExecutor } from '../common/tasks';
import { WebPage } from '@/common/page';
import { PageAgent } from '@/common/agent';

export type APITestType = Pick<TestType<any, any>, 'step'>;

const groupAndCaseForTest = (testInfo: TestInfo) => {
  let groupName: string;
  let caseName: string;
  const titlePath = [...testInfo.titlePath];

  if (titlePath.length > 1) {
    caseName = titlePath.pop()!;
    groupName = `${titlePath.join(' > ')}:${testInfo.line}`;
  } else if (titlePath.length === 1) {
    caseName = titlePath[0];
    groupName = `${caseName}:${testInfo.line}`;
  } else {
    caseName = 'unnamed';
    groupName = 'unnamed';
  }
  return { groupName, caseName };
};

const midSceneAgentKeyId = '_midSceneAgentId';
export const PlaywrightAiFixture = () => {
  const pageAgentMap: Record<string, PageAgent> = {};
  const agentForPage = (page: WebPage, testId: string, groupName: string) => {
    let idForPage = (page as any)[midSceneAgentKeyId];
    if (!idForPage) {
      idForPage = randomUUID();
      (page as any)[midSceneAgentKeyId] = idForPage;
      pageAgentMap[idForPage] = new PageAgent(page, {
        testId: `${testId}-${idForPage}`,
        groupName,
      });
    }
    return pageAgentMap[idForPage];
  };

  return {
    ai: async ({ page }: any, use: any, testInfo: TestInfo) => {
      console.log('ai start', testInfo.title);
      const { groupName } = groupAndCaseForTest(testInfo);
      const agent = agentForPage(page, testInfo.testId, groupName);
      await use(async (taskPrompt: string, opts?: { type?: 'action' | 'query' }) => {
        console.log('ai taskPrompt', taskPrompt);
        const actionType = opts?.type || 'action';
        const result = await agent.ai(taskPrompt, actionType);
        return result;
      });
      console.log('ai end', testInfo.title);
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
      const { groupName } = groupAndCaseForTest(testInfo);
      const agent = agentForPage(page, testInfo.testId, groupName);
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
      const { groupName } = groupAndCaseForTest(testInfo);
      const agent = agentForPage(page, testInfo.testId, groupName);
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
