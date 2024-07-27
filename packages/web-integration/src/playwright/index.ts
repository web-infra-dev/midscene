import { TestInfo, TestType } from '@playwright/test';
import { ExecutionDump, GroupedActionDump } from '@midscene/core';
import { groupedActionDumpFileExt, writeDumpFile } from '@midscene/core/utils';
import { PlayWrightActionAgent } from './actions';

export { PlayWrightActionAgent } from './actions';

export type APITestType = Pick<TestType<any, any>, 'step'>;

// const midScenePlaywrightTestData: {
//   [testId: string]: string
// } = {};

export const PlaywrightAiFixture = () => {
  const dumps: GroupedActionDump[] = [];

  const appendDump = (groupName: string, execution: ExecutionDump) => {
    let currentDump = dumps.find((dump) => dump.groupName === groupName);
    if (!currentDump) {
      currentDump = {
        groupName,
        executions: [],
      };
      dumps.push(currentDump);
    }
    currentDump.executions.push(execution);
  };

  const writeOutActionDumps = (testId: string) => {
    return writeDumpFile(`playwright-${testId}`, groupedActionDumpFileExt, JSON.stringify(dumps));
  };

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

  const aiAction = async (page: any, testInfo: TestInfo, taskPrompt: string) => {
    const { groupName, caseName } = groupAndCaseForTest(testInfo);

    const actionAgent = new PlayWrightActionAgent(page, { taskName: caseName });
    let error: Error | undefined;
    try {
      await actionAgent.action(taskPrompt);
    } catch (e: any) {
      error = e;
    }
    if (actionAgent.actionDump) {
      appendDump(groupName, actionAgent.actionDump);
      const dumpPath = writeOutActionDumps(testInfo.testId);
      testInfo.annotations.push({
        type: 'PLAYWRIGHT_AI_ACTION',
        description: JSON.stringify({
          testId: testInfo.testId,
          dumpPath,
        }),
      });
    }
    if (error) {
      // playwright cli won't print error cause, so we print it here
      console.error(error);
      throw new Error(error.message, { cause: error });
    }
  };

  const aiQuery = async (page: any, testInfo: TestInfo, demand: any) => {
    const { groupName, caseName } = groupAndCaseForTest(testInfo);

    const actionAgent = new PlayWrightActionAgent(page, { taskName: caseName });
    let error: Error | undefined;
    let result: any;
    try {
      result = await actionAgent.query(demand);
    } catch (e: any) {
      error = e;
    }
    if (actionAgent.actionDump) {
      appendDump(groupName, actionAgent.actionDump);
      writeOutActionDumps();
    }
    if (error) {
      // playwright cli won't print error cause, so we print it here
      console.error(error);
      throw new Error(error.message, { cause: error });
    }
    return result;
  };

  return {
    // shortcut
    ai: async ({ page }: any, use: any, testInfo: TestInfo) => {
      await use(async (taskPrompt: string, type = 'action') => {
        if (type === 'action') {
          return aiAction(page, testInfo, taskPrompt);
        } else if (type === 'query') {
          return aiQuery(page, testInfo, taskPrompt);
        }
        throw new Error(`Unknown or Unsupported task type: ${type}, only support 'action' or 'query'`);
      });
    },
    aiAction: async ({ page }: any, use: any, testInfo: TestInfo) => {
      await use(async (taskPrompt: string) => {
        await aiAction(page, testInfo, taskPrompt);
      });
    },
    aiQuery: async ({ page }: any, use: any, testInfo: TestInfo) => {
      await use(async function (demand: any) {
        return aiQuery(page, testInfo, demand);
      });
    },
  };
};

export type PlayWrightAiFixtureType = {
  ai: <T = any>(prompt: string, type?: 'action' | 'query') => Promise<T>;
  aiAction: (taskPrompt: string) => ReturnType<PlayWrightActionAgent['action']>;
  aiQuery: <T = any>(demand: any) => Promise<T>;
};
