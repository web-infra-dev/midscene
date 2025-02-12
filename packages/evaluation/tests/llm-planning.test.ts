import { assert } from 'node:console';
import { writeFileSync } from 'node:fs';
import { describe } from 'node:test';
import {
  MIDSCENE_MODEL_NAME,
  PlanningLocateParam,
  getAIConfig,
  plan,
} from '@midscene/core';
import { MATCH_BY_POSITION } from '@midscene/core/env';
import { sleep } from '@midscene/core/utils';
import dotenv from 'dotenv';
import { test } from 'vitest';
import { TestResultCollector } from './test-analyzer';
import { buildContext, getCases } from './util';

dotenv.config({
  debug: true,
  override: true,
});

const failCaseThreshold = process.env.CI ? 1 : 0;
const testSources = [
  'todo',
  // 'online_order',
  // 'online_order_list',
  // 'taobao',
  // 'aweme-login',
  // 'aweme-play',
];

describe('ai planning', () => {
  testSources.forEach((source) => {
    test(
      `${source}: planning`,
      async () => {
        const { path: aiDataPath, content: cases } = await getCases(
          source,
          'planning',
        );

        const resultCollector = new TestResultCollector(
          `${source}-planning`,
          getAIConfig(MIDSCENE_MODEL_NAME) || 'unspecified',
        );

        const annotations: Array<{
          indexId: number;
          points: [number, number, number, number];
        }> = [];
        for (const [index, testCase] of cases.testCases.entries()) {
          const context = await buildContext(source);

          const prompt = testCase.prompt;
          const startTime = Date.now();

          const res = await plan(prompt, {
            context,
          });

          assert(res.actions.length > 0, 'No actions found');

          if (process.env.UPDATE_ANSWER_DATA) {
            testCase.response_planning = res;
            writeFileSync(aiDataPath, JSON.stringify(cases, null, 2));
          }
          //   // write testCase to file
          // }
          // if (annotations.length > 0) {
          //   const markedImage = await annotatePoints(
          //     context.screenshotBase64,
          //     annotations,
          //   );
          //   await saveBase64Image({
          //     base64Data: markedImage,
          //     outputPath: `${aiDataPath}-coordinates-annotated.png`,
          //   });
          // }

          resultCollector.addResult(
            aiDataPath.split('/').pop() || '',
            testCase,
            res,
            Date.now() - startTime,
          );
        }

        await resultCollector.analyze(failCaseThreshold);
        await sleep(3 * 1000);
      },
      {
        timeout: 240 * 1000,
      },
    );
  });
});
