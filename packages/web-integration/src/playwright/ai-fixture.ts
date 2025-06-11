import { randomUUID } from 'node:crypto';
import type { PageAgent, PageAgentOpt } from '@/common/agent';
import { replaceIllegalPathCharsAndSpace } from '@/common/utils';
import { PlaywrightAgent } from '@/playwright/index';
import type { AgentWaitForOpt } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import { type TestInfo, type TestType, test } from '@playwright/test';
import type { Page as OriginPlaywrightPage } from 'playwright';
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

  const taskTitleWithRetry = `${taskTitle}${testInfo.retry ? `(retry #${testInfo.retry})` : ''}`;

  return {
    file: taskFile,
    id: replaceIllegalPathCharsAndSpace(`${taskFile}(${taskTitle})`),
    title: replaceIllegalPathCharsAndSpace(taskTitleWithRetry),
  };
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
      const { file, id, title } = groupAndCaseForTest(testInfo);
      pageAgentMap[idForPage] = new PlaywrightAgent(page, {
        testId: `playwright-${testId}-${idForPage}`,
        forceSameTabNavigation,
        cacheId: id,
        groupName: title,
        groupDescription: file,
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
      | 'aiRightClick'
      | 'aiQuery'
      | 'aiAssert'
      | 'aiWaitFor'
      | 'aiLocate'
      | 'aiNumber'
      | 'aiString'
      | 'aiBoolean';
  }) {
    const { page, testInfo, use, aiActionType } = options;
    const agent = createOrReuseAgentForPage(page, testInfo) as PlaywrightAgent;

    await use(async (taskPrompt: string, ...args: any[]) => {
      return new Promise((resolve, reject) => {
        test.step(`ai-${aiActionType} - ${JSON.stringify(taskPrompt)}`, async () => {
          try {
            debugPage(
              `waitForNetworkIdle timeout: ${waitForNetworkIdleTimeout}`,
            );
            await agent.waitForNetworkIdle(waitForNetworkIdleTimeout);
          } catch (error) {
            console.warn(
              '[midscene:warning] Waiting for network idle has timed out, but Midscene will continue execution. Please check https://midscenejs.com/faq.html#customize-the-network-timeout for more information on customizing the network timeout',
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
    aiRightClick: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiRightClick',
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
    aiLocate: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiLocate',
      });
    },
    aiNumber: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiNumber',
      });
    },
    aiString: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiString',
      });
    },
    aiBoolean: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiBoolean',
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
  aiRightClick: (
    ...args: Parameters<PageAgent['aiRightClick']>
  ) => ReturnType<PageAgent['aiRightClick']>;
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
  aiLocate: (
    ...args: Parameters<PageAgent['aiLocate']>
  ) => ReturnType<PageAgent['aiLocate']>;
  aiNumber: (
    ...args: Parameters<PageAgent['aiNumber']>
  ) => ReturnType<PageAgent['aiNumber']>;
  aiString: (
    ...args: Parameters<PageAgent['aiString']>
  ) => ReturnType<PageAgent['aiString']>;
  aiBoolean: (
    ...args: Parameters<PageAgent['aiBoolean']>
  ) => ReturnType<PageAgent['aiBoolean']>;
};
