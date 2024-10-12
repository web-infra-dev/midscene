import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe } from 'node:test';
import { AiInspectElement, plan } from '@/ai-model';
import { sleep } from '@/utils';
import { afterAll, expect, test } from 'vitest';
import { repeatTime } from '../util';
import {
  TestResultAnalyzer,
  updateAggregatedResults,
} from './test-suite/test-analyzer';
import {
  type InspectAiTestCase,
  getPageTestData,
  repeat,
  runTestCases,
} from './test-suite/util';

const testSources = [
  'todo',
  'online_order',
  'online_order_list',
  'taobao',
  'aweme_login',
  'aweme_play',
];

describe('ai inspect element', () => {
  const testResult: {
    path: string;
    result: {
      score: number;
      averageTime: string;
      successCount: number;
      failCount: number;
    };
  }[] = [];
  afterAll(() => {
    console.table(
      testResult.map((r) => {
        return {
          path: r.path,
          ...r.result,
        };
      }),
    );
  });
  repeat(repeatTime, (repeatIndex) => {
    testSources.forEach((source) => {
      test(
        `${source}-${repeatIndex}: inspect element`,
        async () => {
          const aiDataPath = path.join(
            __dirname,
            `ai-data/inspect/${source}.json`,
          );
          const aiData = JSON.parse(
            readFileSync(aiDataPath, 'utf-8'),
          ) as InspectAiTestCase;

          const { context } = await getPageTestData(
            path.join(__dirname, aiData.testDataPath),
          );

          const { aiResponse } = await runTestCases(
            aiData.testCases,
            context,
            async (testCase) => {
              if (process.env.PLAN_INSPECT) {
                // use planning to get quick answer to test element inspector
                const res = await plan(testCase.description, {
                  context,
                });

                return {
                  elements: res.plans[0].quickAnswer
                    ? [res.plans[0].quickAnswer]
                    : [],
                };
              }

              const { parseResult } = await AiInspectElement({
                context,
                multi: testCase.multi,
                targetElementDescription: testCase.description,
              });
              return parseResult;
            },
          );

          const analyzer = new TestResultAnalyzer(
            context,
            aiDataPath,
            aiData,
            aiResponse,
            repeatIndex,
          );
          const resultData = analyzer.analyze();

          updateAggregatedResults(source, resultData);

          testResult.push({
            path: `${source}-${repeatIndex}: inspect element -- result:`,
            result: {
              score: resultData.score,
              averageTime: resultData.averageTime,
              successCount: resultData.successCount,
              failCount: resultData.failCount,
            },
          });

          expect(resultData.score).toBeGreaterThan(95);
        },
        {
          timeout: 90 * 1000,
        },
      );
    });
  });
});

test('inspect with quick answer', async () => {
  const { context } = await getPageTestData(
    path.join(__dirname, './test-data/todo'),
  );

  const startTime = Date.now();
  const { parseResult } = await AiInspectElement({
    context,
    multi: false,
    targetElementDescription: 'never mind',
    quickAnswer: {
      id: 'fbc2d0029b',
      reason: 'never mind',
      text: 'never mind',
    },
  });
  const endTime = Date.now();
  const cost = endTime - startTime;
  expect(parseResult.elements.length).toBe(1);
  expect(cost).toBeLessThan(100);
});
