import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe } from 'node:test';
import { AiInspectElement, plan } from '@/ai-model';
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
  // 'todo',
  'online_order',
  // 'onli`ne_order_list',
  // 'taobao',
  // 'aweme_login',
  // 'aweme_play`,
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

  afterAll(async () => {
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
    const runType = repeatIndex <= repeatTime / 2 ? 'inspect' : 'planning';
    testSources.forEach((source) => {
      test(
        `${source}-${repeatIndex}-${runType}: locate element`,
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

          const { elementById } = await context.describer();

          const { aiResponse } = await runTestCases(
            aiData.testCases,
            context,
            async (testCase) => {
              if (runType === 'planning') {
                // use planning to get quick answer to test element inspector
                const res: any = await plan(
                  `Tap this: ${testCase.description}`,
                  {
                    context,
                  },
                );
                console.log('planning result:', JSON.stringify(res, null, 2));

                const matchedId = res.actions[0].locate?.id;
                if (matchedId) {
                  return {
                    elements: [elementById(matchedId)],
                  };
                }

                return {
                  elements: [],
                };
              }

              const { parseResult } = await AiInspectElement({
                context,
                multi: testCase.multi,
                targetElementDescription: testCase.description,
              });
              return parseResult as any;
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
          // await sleep(20 * 1000);
          expect(resultData.failCount).toBeLessThanOrEqual(1);
        },
        {
          timeout: 120 * 1000,
        },
      );
    });
  });
});
