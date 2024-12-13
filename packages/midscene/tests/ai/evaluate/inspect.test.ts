import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe } from 'node:test';
import { AiInspectElement, plan } from '@/ai-model';
import { afterAll, expect, test } from 'vitest';
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

const repeatTime = 2;
const relocateAfterPlanning = false;
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
    const runType = repeatIndex % 2 === 1 ? 'inspect' : 'planning';
    // const runType = 'planning';
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
              let prompt = testCase.description;
              if (runType === 'planning') {
                // use planning to get quick answer to test element inspector
                const res = await plan(
                  `follow the instruction (if any) or tap this element:${testCase.description}. Current time is ${new Date().toLocaleString()}.`,
                  {
                    context,
                  },
                );

                console.log('planning res', res);
                prompt = res.actions[0].locate?.prompt as string;
                console.log('prompt from planning', prompt);
                expect(prompt).toBeTruthy();
                // console.log('planning res', res.actions[0].locate?.prompt);

                if (!relocateAfterPlanning) {
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
              }

              const { parseResult } = await AiInspectElement({
                context,
                multi: false,
                targetElementDescription: prompt,
              });
              return {
                ...parseResult,
                elements: parseResult.elements.length
                  ? [parseResult.elements[0]]
                  : [],
              };
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
          expect(resultData.successCount).toBeGreaterThan(0);
          expect(resultData.failCount).toBeLessThanOrEqual(
            source === 'aweme_play' ? 2 : 0,
          );
        },
        {
          timeout: 120 * 1000,
        },
      );
    });
  });
});
