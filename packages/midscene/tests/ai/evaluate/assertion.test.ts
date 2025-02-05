import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe } from 'node:test';
import { AiAssert } from '@/ai-model';
import { afterAll, expect, test } from 'vitest';
import {
  type InspectAiTestCase,
  getPageTestData,
  repeatFile,
} from './test-suite/util';
import 'dotenv/config';
import { repeatTime } from '../util';

const testSources = [
  'online_order',
  // 'todo',
  // 'online_order_list',
  // 'taobao',
  // 'aweme_login',
  // 'aweme_play',
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
  repeatFile(testSources, repeatTime, (source, repeatIndex) => {
    const aiDataPath = path.join(__dirname, `ai-data/assertion/${source}.json`);
    const aiData = JSON.parse(
      readFileSync(aiDataPath, 'utf-8'),
    ) as InspectAiTestCase;

    aiData.testCases.forEach((testCase, index) => {
      const prompt = testCase.prompt;
      test(
        `${source}-${repeatIndex}: assertion-${prompt.slice(0, 30)}...`,
        async () => {
          const { context } = await getPageTestData(
            path.join(__dirname, aiData.testDataPath),
          );

          const { prompt, expected } = testCase;
          const result = await AiAssert({
            assertion: prompt,
            context,
          });

          expect(typeof result?.content?.pass).toBe('boolean');
          if (result?.content?.pass !== expected) {
            throw new Error(
              `assertion failed: ${prompt} expected: ${expected}, actual: ${result?.content?.pass}, thought: ${result?.content?.thought}`,
            );
          }

          console.log('assertion passed, thought:', result?.content?.thought);
        },
        {
          timeout: 60 * 1000,
        },
      );
    });
  });
});
