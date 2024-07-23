import { readFileSync } from 'fs';
import { TestInfo, TestType } from '@playwright/test';
import { GroupedActionDump } from '@midscene/core';
import { groupedActionDumpFileExt, writeDumpFile } from '@midscene/core/utils';
import { PlayWrightAI } from './actions';

export { PlayWrightAI } from './actions';

export type APITestType = Pick<TestType<any, any>, 'step'>;

const instanceKeyName = 'midscene-ai-instance';

const actionDumps: GroupedActionDump[] = [];
const writeOutActionDumps = () => {
  writeDumpFile(`playwright-${process.pid}`, groupedActionDumpFileExt, JSON.stringify(actionDumps));
};

/**
 * A helper function to generate a playwright fixture for ai(). Can be used in
 * a playwright setup
 */

export const PlaywrightAiFixture = () => {
  return {
    ai: async ({ page }: any, use: any, testInfo: TestInfo) => {
      let groupName: string;
      let caseName: string;
      const titlePath = [...testInfo.titlePath];
      // use the last item of testInfo.titlePath() as the caseName, join the previous ones with ">" as groupName
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

      // find the GroupedActionDump in actionDumps or create a new one
      let actionDump = actionDumps.find((dump) => dump.groupName === groupName);
      if (!actionDump) {
        actionDump = {
          groupName,
          executions: [],
        };
        actionDumps.push(actionDump);
      }

      const wrapped = async (task: string /* options: any */) => {
        const aiInstance = page[instanceKeyName] ?? new PlayWrightAI(page, { taskName: caseName });
        let error: Error | undefined;
        try {
          await aiInstance.action(task);
        } catch (e: any) {
          error = e;
        }
        if (aiInstance.dumpPath) {
          actionDump!.executions.push(JSON.parse(readFileSync(aiInstance.dumpPath, 'utf8')));
          writeOutActionDumps();
        }
        if (error) {
          throw new Error(error.message, { cause: error });
        }
      };
      await use(wrapped);
    },
  };
};

export type PlayWrightAiFixtureType = {
  ai: (task: string | string[]) => ReturnType<PlayWrightAI['action']>;
};
