import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlaywrightAgent, type PlaywrightWebPage } from '@/playwright/index';
import type { WebPageAgentOpt } from '@/web-element';
import type { Cache } from '@midscene/core';
import type { AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { processCacheConfig } from '@midscene/core/utils';
import {
  DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT,
} from '@midscene/shared/constants';
import { getDebug } from '@midscene/shared/logger';
import { uuid } from '@midscene/shared/utils';
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

// Track temporary dump files per page for cleanup
const pageTempFiles = new Map<string, string>();

type PlaywrightCacheConfig = {
  strategy?: 'read-only' | 'read-write' | 'write-only';
  id?: string;
};
type PlaywrightCache = false | true | PlaywrightCacheConfig;

export const PlaywrightAiFixture = (options?: {
  forceSameTabNavigation?: boolean;
  waitForNetworkIdleTimeout?: number;
  waitForNavigationTimeout?: number;
  cache?: PlaywrightCache;
}) => {
  const {
    forceSameTabNavigation = true,
    waitForNetworkIdleTimeout = DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT,
    waitForNavigationTimeout = DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT,
    cache,
  } = options ?? {};

  // Helper function to process cache configuration and auto-generate ID from test info
  const processTestCacheConfig = (testInfo: TestInfo): Cache | undefined => {
    // Generate ID from test info
    const { id } = groupAndCaseForTest(testInfo);

    // Use shared processCacheConfig with generated ID as fallback
    return processCacheConfig(cache as Cache, id);
  };

  const pageAgentMap: Record<string, PageAgent<PlaywrightWebPage>> = {};
  const createOrReuseAgentForPage = (
    page: OriginPlaywrightPage,
    testInfo: TestInfo, // { testId: string; taskFile: string; taskTitle: string },
    opts?: WebPageAgentOpt,
  ) => {
    let idForPage = (page as any)[midsceneAgentKeyId];
    if (!idForPage) {
      idForPage = uuid();
      (page as any)[midsceneAgentKeyId] = idForPage;
      const { testId } = testInfo;
      const { file, title } = groupAndCaseForTest(testInfo);
      const cacheConfig = processTestCacheConfig(testInfo);

      pageAgentMap[idForPage] = new PlaywrightAgent(page, {
        testId: `playwright-${testId}-${idForPage}`,
        forceSameTabNavigation,
        cache: cacheConfig,
        groupName: title,
        groupDescription: file,
        generateReport: false, // we will generate it in the reporter
        ...opts,
      });

      pageAgentMap[idForPage].onDumpUpdate = (dump: string) => {
        updateDumpAnnotation(testInfo, dump, idForPage);
      };

      page.on('close', () => {
        debugPage('page closed');

        // Generate final dump with inline screenshots before destroying the agent
        (async () => {
          try {
            const agent = pageAgentMap[idForPage];
            if (agent) {
              // Get dump with inline screenshots
              const dumpWithInlineScreenshots =
                await agent.dump.serializeWithInlineScreenshots();
              // Update the temp file with inline screenshot data
              const tempFilePath = pageTempFiles.get(idForPage);
              if (tempFilePath) {
                writeFileSync(tempFilePath, dumpWithInlineScreenshots, 'utf-8');
                debugPage(
                  `Updated temp file with inline screenshots: ${tempFilePath}`,
                );
              }
            }
          } catch (error) {
            debugPage('Error generating dump with inline screenshots:', error);
          } finally {
            // Clean up
            pageTempFiles.delete(idForPage);
            pageAgentMap[idForPage]?.destroy();
            delete pageAgentMap[idForPage];
          }
        })().catch((error) => {
          console.error('Error in page close handler:', error);
        });
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
      | 'aiAct'
      | 'aiAction'
      | 'aiHover'
      | 'aiInput'
      | 'aiKeyboardPress'
      | 'aiScroll'
      | 'aiTap'
      | 'aiRightClick'
      | 'aiDoubleClick'
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
      | 'recordToReport'
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
            const result = await (agent[aiActionType] as AgentMethod).bind(
              agent,
            )(taskPrompt, ...args);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });
    });
  }

  const updateDumpAnnotation = (
    test: TestInfo,
    dump: string,
    pageId: string,
  ) => {
    // 1. First, clean up the old temp file if it exists
    const oldTempFilePath = pageTempFiles.get(pageId);
    if (oldTempFilePath) {
      try {
        rmSync(oldTempFilePath, { force: true });
      } catch (error) {
        // Silently ignore if old file is already cleaned up
      }
    }

    // 2. Create new temp file with predictable name using pageId
    const tempFileName = `midscene-dump-${test.testId || uuid()}-${pageId}.json`;
    const tempFilePath = join(tmpdir(), tempFileName);

    // 3. Write dump to the new temporary file
    try {
      writeFileSync(tempFilePath, dump, 'utf-8');
      debugPage(`Dump written to temp file: ${tempFilePath}`);

      // 4. Track the new temp file (only if write succeeded)
      pageTempFiles.set(pageId, tempFilePath);

      // Store only the file path in annotation (only if write succeeded)
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
    } catch (error) {
      // If write fails (e.g., disk full), don't track the file or add annotation
      // This prevents reporter from trying to read a non-existent file
      debugPage(
        `Failed to write temp file: ${tempFilePath}. Skipping annotation.`,
        error,
      );
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
          const cacheConfig = processTestCacheConfig(testInfo);

          // Handle cache configuration priority:
          // 1. If user provides cache in opts, use it (but auto-generate ID if missing)
          // 2. Otherwise use fixture's cache config
          let finalCacheConfig = cacheConfig;
          if (opts?.cache !== undefined) {
            const userCache = opts.cache;
            if (userCache === false) {
              finalCacheConfig = false;
            } else if (userCache === true) {
              // Auto-generate ID for user's cache: true
              const { id } = groupAndCaseForTest(testInfo);
              finalCacheConfig = { id };
            } else if (typeof userCache === 'object') {
              if (!userCache.id) {
                // Auto-generate ID for user's cache object without ID
                const { id } = groupAndCaseForTest(testInfo);
                finalCacheConfig = { ...userCache, id };
              } else {
                finalCacheConfig = userCache;
              }
            }
          }

          const agent = createOrReuseAgentForPage(propsPage || page, testInfo, {
            waitForNavigationTimeout,
            waitForNetworkIdleTimeout,
            cache: finalCacheConfig,
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
    aiAct: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiAct',
      });
    },
    /**
     * @deprecated Use {@link PlaywrightAiFixture.aiAct} instead.
     */
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
    aiDoubleClick: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'aiDoubleClick',
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
    recordToReport: async (
      { page }: { page: OriginPlaywrightPage },
      use: any,
      testInfo: TestInfo,
    ) => {
      await generateAiFunction({
        page,
        testInfo,
        use,
        aiActionType: 'recordToReport',
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
  ai: <T = any>(...args: Parameters<PageAgent['ai']>) => Promise<T>;
  aiAct: (
    ...args: Parameters<PageAgent['aiAct']>
  ) => ReturnType<PageAgent['aiAct']>;
  /**
   * @deprecated Use {@link PlayWrightAiFixtureType.aiAct} instead.
   */
  aiAction: (
    ...args: Parameters<PageAgent['aiAction']>
  ) => ReturnType<PageAgent['aiAction']>;
  aiTap: (
    ...args: Parameters<PageAgent['aiTap']>
  ) => ReturnType<PageAgent['aiTap']>;
  aiRightClick: (
    ...args: Parameters<PageAgent['aiRightClick']>
  ) => ReturnType<PageAgent['aiRightClick']>;
  aiDoubleClick: (
    ...args: Parameters<PageAgent['aiDoubleClick']>
  ) => ReturnType<PageAgent['aiDoubleClick']>;
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
  aiQuery: <T = any>(...args: Parameters<PageAgent['aiQuery']>) => Promise<T>;
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
  recordToReport: (
    ...args: Parameters<PageAgent['recordToReport']>
  ) => ReturnType<PageAgent['recordToReport']>;
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
