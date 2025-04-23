import { randomUUID } from 'node:crypto';
import type { PageAgent, PageAgentOpt } from '@/common/agent';
import { PlaywrightAgent } from '@/playwright/index';
import type { AgentWaitForOpt } from '@midscene/core';
import { type TestInfo, type TestType, test } from '@playwright/test';
import type { Page as OriginPlaywrightPage } from 'playwright';
import { getDebug } from '@midscene/shared/logger';

export type APITestType = Pick<TestType<any, any>, 'step'>;

const debugPage = getDebug('web:playwright:ai-fixture');

const groupAndCaseForTest = (testInfo: TestInfo) => {
  let taskFile: string;
  let taskTitle: string;
  const titlePath = [...testInfo.titlePath];

  if (titlePath.length > 1) {
    taskFile = titlePath.shift() || 'unnamed';
    taskTitle = titlePath.join('__');
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

export const PlaywrightAiFixture = (options?: {
  forceSameTabNavigation?: boolean;
  waitForNetworkIdleTimeout?: number;
}) => {
  const { forceSameTabNavigation = true, waitForNetworkIdleTimeout = 1000 } =
    options ?? {};
  const pageAgentMap: Record<string, PageAgent> = {};
  const createOrReuseAgentForPage = (
    page: OriginPlaywrightPage,
    testInfo: TestInfo, // { testId: string; taskFile: string; taskTitle: string },
    opts?: PageAgentOpt,
  ) => {
    let idForPage = (page as any)[midsceneAgentKeyId];
    if (!idForPage) {
      idForPage = randomUUID();
      (page as any)[midsceneAgentKeyId] = idForPage;
      const { testId } = testInfo;
      const { taskFile, taskTitle } = groupAndCaseForTest(testInfo);
      pageAgentMap[idForPage] = new PlaywrightAgent(page, {
        testId: `playwright-${testId}-${idForPage}`,
        forceSameTabNavigation,
        cacheId: `${taskFile}(${taskTitle})`,
        groupName: taskTitle,
        groupDescription: taskFile,
        generateReport: false, // we will generate it in the reporter
        ...opts,
      });
    }
    return pageAgentMap[idForPage];
  };

  async function generateAiFunction(options: {
    page: OriginPlaywrightPage;
    testInfo: TestInfo;
    use: any;
    aiActionType:
      | 'ai'
      | 'aiAction'
      | 'aiHover'
      | 'aiInput'
      | 'aiKeyboardPress'
      | 'aiScroll'
      | 'aiTap'
      | 'aiQuery'
      | 'aiAssert'
      | 'aiWaitFor';
  }) {
    const { page, testInfo, use, aiActionType } = options;
    const agent = createOrReuseAgentForPage(page, testInfo);
    await use(async (taskPrompt: string, ...args: any[]) => {
      return new Promise((resolve, reject) => {
        test.step(`ai-${aiActionType} - ${JSON.stringify(taskPrompt)}`, async () => {
          try {
            debugPage(
              `waitForNetworkIdle timeout: ${waitForNetworkIdleTimeout}`,
            );
            await waitForNetworkIdle(page, waitForNetworkIdleTimeout);
          } catch (error) {
            console.warn(
              `[Warning:Midscene] Network idle timeout: current timeout is ${waitForNetworkIdleTimeout}ms, custom timeout please check https://midscenejs.com/faq.html#network-timeout`,
            );
          }
          try {
            type AgentMethod = (
              prompt: string,
              ...restArgs: any[]
            ) => Promise<any>;
            const result = await (agent[aiActionType] as AgentMethod)(
              taskPrompt,
              ...(args || []),
            );
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });
    });
    updateDumpAnnotation(testInfo, agent.dumpDataString());
  }

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
    agentForPage: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await use(
        async (
          propsPage?: OriginPlaywrightPage | undefined,
          opts?: PageAgentOpt,
        ) => {
          const agent = createOrReuseAgentForPage(
            propsPage || page,
            testInfo,
            opts,
          );
          return agent;
        },
      );
    },
    ai: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'ai',
      });
    },
    aiAction: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiAction',
      });
    },
    aiTap: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiTap',
      });
    },
    aiHover: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiHover',
      });
    },
    aiInput: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiInput',
      });
    },
    aiKeyboardPress: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiKeyboardPress',
      });
    },
    aiScroll: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiScroll',
      });
    },
    aiQuery: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiQuery',
      });
    },
    aiAssert: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiAssert',
      });
    },
    aiWaitFor: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiWaitFor',
      });
    },
  };
};

export type PlayWrightAiFixtureType = {
  agentForPage: (page?: any, opts?: any) => Promise<PageAgent>;
  ai: <T = any>(prompt: string) => Promise<T>;
  aiAction: (taskPrompt: string) => ReturnType<PageAgent['aiAction']>;
  aiTap: (
    ...args: Parameters<PageAgent['aiTap']>
  ) => ReturnType<PageAgent['aiTap']>;
  aiHover: (
    ...args: Parameters<PageAgent['aiHover']>
  ) => ReturnType<PageAgent['aiHover']>;
  aiInput: (
    ...args: Parameters<PageAgent['aiInput']>
  ) => ReturnType<PageAgent['aiInput']>;
  aiKeyboardPress: (
    ...args: Parameters<PageAgent['aiKeyboardPress']>
  ) => ReturnType<PageAgent['aiKeyboardPress']>;
  aiScroll: (
    ...args: Parameters<PageAgent['aiScroll']>
  ) => ReturnType<PageAgent['aiScroll']>;
  aiQuery: <T = any>(
    ...args: Parameters<PageAgent['aiQuery']>
  ) => ReturnType<PageAgent['aiQuery']>;
  aiAssert: (
    ...args: Parameters<PageAgent['aiAssert']>
  ) => ReturnType<PageAgent['aiAssert']>;
  aiWaitFor: (assertion: string, opt?: AgentWaitForOpt) => Promise<void>;
};

async function waitForNetworkIdle(page: OriginPlaywrightPage, timeout = 1000) {
  await page.waitForLoadState('networkidle', { timeout });
}
