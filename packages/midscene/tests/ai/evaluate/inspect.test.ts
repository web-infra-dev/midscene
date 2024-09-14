import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe } from 'node:test';
import { AiInspectElement } from '@/ai-model';
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

const testSources = ['todo', 'online_order', 'online_order_list'];

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
    console.log('testResult', testResult);
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
              const { parseResult } = await AiInspectElement({
                context,
                multi: testCase.multi,
                findElementDescription: testCase.description,
              });
              return parseResult;
            },
          );

          const analyzer = new TestResultAnalyzer(
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
