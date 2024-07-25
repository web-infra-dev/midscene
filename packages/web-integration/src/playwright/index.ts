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
    groupName = titlePath.join(' > ');
  } else if (titlePath.length === 1) {
    caseName = titlePath[0];
    groupName = caseName;
  } else {
    caseName = 'unnamed';
    groupName = 'unnamed';
  }
  return { groupName, caseName };
};

const midSceneAgentKeyId = '_midSceneAgentId';
export const PlaywrightAiFixture = () => {
  const pageAgentMap: Record<string, PageAgent> = {};
  const agentForPage = (page: WebPage) => {
    let idForPage = (page as any)[midSceneAgentKeyId];
    if (!idForPage) {
      idForPage = randomUUID();
      (page as any)[midSceneAgentKeyId] = idForPage;
      pageAgentMap[idForPage] = new PageAgent(page);
    }
    return pageAgentMap[idForPage];
  };

  return {
    ai: async ({ page }: any, use: any, testInfo: TestInfo) => {
      await use(async (taskPrompt: string, type = 'action') => {
        const { groupName, caseName } = groupAndCaseForTest(testInfo);
        const agent = agentForPage(page);
        return agent.ai(taskPrompt, type, caseName, groupName);
      });
    },
    aiAction: async ({ page }: any, use: any, testInfo: TestInfo) => {
      await use(async (taskPrompt: string) => {
        const agent = agentForPage(page);

        const { groupName, caseName } = groupAndCaseForTest(testInfo);
        await agent.aiAction(taskPrompt, caseName, groupName);
      });
    },
    aiQuery: async ({ page }: any, use: any, testInfo: TestInfo) => {
      await use(async function (demand: any) {
        const agent = agentForPage(page);
        const { groupName, caseName } = groupAndCaseForTest(testInfo);
        return agent.aiQuery(demand, caseName, groupName);
      });
    },
  };
};

export type PlayWrightAiFixtureType = {
  ai: <T = any>(prompt: string, type?: 'action' | 'query') => Promise<T>;
  aiAction: (taskPrompt: string) => ReturnType<PageTaskExecutor['action']>;
  aiQuery: <T = any>(demand: any) => Promise<T>;
};
