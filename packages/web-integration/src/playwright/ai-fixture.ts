import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlaywrightAgent, type PlaywrightWebPage } from '@/playwright/index';
import type { WebPageAgentOpt } from '@/web-element';
import type { AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import {
  DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT,
} from '@midscene/shared/constants';
import { getDebug } from '@midscene/shared/logger';
import { replaceIllegalPathCharsAndSpace } from '@midscene/shared/utils';
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
  waitForNavigationTimeout?: number;
}) => {
  const {
    forceSameTabNavigation = true,
    waitForNetworkIdleTimeout = DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT,
    waitForNavigationTimeout = DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT,
  } = options ?? {};
  const pageAgentMap: Record<string, PageAgent<PlaywrightWebPage>> = {};
  const createOrReuseAgentForPage = (
    page: OriginPlaywrightPage,
    testInfo: TestInfo, // { testId: string; taskFile: string; taskTitle: string },
    opts?: WebPageAgentOpt,
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

      pageAgentMap[idForPage].onDumpUpdate = (dump: string) => {
        updateDumpAnnotation(testInfo, dump);
      };

      page.on('close', () => {
        debugPage('page closed');
        pageAgentMap[idForPage].destroy();
        delete pageAgentMap[idForPage];
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
      | 'aiLongPress'
      | 'aiSwipe'
      | 'aiQuery'
      | 'aiAssert'
      | 'aiWaitFor'
      | 'aiLocate'
      | 'aiNumber'
      | 'aiString'
      | 'aiBoolean'
      | 'aiAsk'
      | 'runYaml'
      | 'setAIActionContext'
      | 'evaluateJavaScript'
      | 'logScreenshot'
      | 'freezePageContext'
      | 'unfreezePageContext';
  }) {
    const { page, testInfo, use, aiActionType } = options;
    const agent = createOrReuseAgentForPage(page, testInfo, {
      waitForNavigationTimeout,
      waitForNetworkIdleTimeout,
    }) as PlaywrightAgent;

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
  }

  const updateDumpAnnotation = (test: TestInfo, dump: string) => {
    // Write dump to temporary file
    const tempFileName = `midscene-dump-${test.testId || randomUUID()}-${Date.now()}.json`;
    const tempFilePath = join(tmpdir(), tempFileName);

    writeFileSync(tempFilePath, dump, 'utf-8');
    debugPage(`Dump written to temp file: ${tempFilePath}`);

    // Store only the file path in annotation
    const currentAnnotation = test.annotations.find((item) => {
      return item.type === midsceneDumpAnnotationId;
    });
    if (currentAnnotation) {
      // Store file path instead of dump content
      currentAnnotation.description = tempFilePath;
    } else {
      test.annotations.push({
        type: midsceneDumpAnnotationId,
        description: tempFilePath,
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
          opts?: AgentOpt,
        ) => {
          const agent = createOrReuseAgentForPage(propsPage || page, testInfo, {
            waitForNavigationTimeout,
            waitForNetworkIdleTimeout,
            ...opts,
          });
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
    aiLongPress: async(
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiLongPress',
      });
    },
    aiSwipe: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiSwipe',
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
    aiAsk: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiAsk',
      });
    },
    runYaml: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'runYaml',
      });
    },
    setAIActionContext: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'setAIActionContext',
      });
    },
    evaluateJavaScript: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'evaluateJavaScript',
      });
    },
    logScreenshot: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'logScreenshot',
      });
    },
    freezePageContext: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'freezePageContext',
      });
    },
    unfreezePageContext: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'unfreezePageContext',
      });
    },
  };
};

export type PlayWrightAiFixtureType = {
  agentForPage: (
    page?: any,
    opts?: any,
  ) => Promise<PageAgent<PlaywrightWebPage>>;
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
  aiWaitFor: (...args: Parameters<PageAgent['aiWaitFor']>) => Promise<void>;
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
  aiAsk: (
    ...args: Parameters<PageAgent['aiAsk']>
  ) => ReturnType<PageAgent['aiAsk']>;
  runYaml: (
    ...args: Parameters<PageAgent['runYaml']>
  ) => ReturnType<PageAgent['runYaml']>;
  setAIActionContext: (
    ...args: Parameters<PageAgent['setAIActionContext']>
  ) => ReturnType<PageAgent['setAIActionContext']>;
  evaluateJavaScript: (
    ...args: Parameters<PageAgent['evaluateJavaScript']>
  ) => ReturnType<PageAgent['evaluateJavaScript']>;
  logScreenshot: (
    ...args: Parameters<PageAgent['logScreenshot']>
  ) => ReturnType<PageAgent['logScreenshot']>;
  freezePageContext: (
    ...args: Parameters<PageAgent['freezePageContext']>
  ) => ReturnType<PageAgent['freezePageContext']>;
  unfreezePageContext: (
    ...args: Parameters<PageAgent['unfreezePageContext']>
  ) => ReturnType<PageAgent['unfreezePageContext']>;
};
