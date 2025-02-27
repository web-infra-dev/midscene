import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe } from 'node:test';
import { AiAssert } from '@midscene/core';
import { buildContext } from '@midscene/core/evaluation';
import { afterAll, expect, test } from 'vitest';
import { type InspectAiTestCase, repeatFile } from './util';

import 'dotenv/config';
import dotenv from 'dotenv';

dotenv.config({
  debug: true,
  override: true,
});

const testSources = ['online_order', 'online_order_list'];

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
  repeatFile(testSources, 1, (source, repeatIndex) => {
    const aiDataPath = path.join(
      __dirname,
      `../page-cases/assertion/${source}.json`,
    );
    const aiData = JSON.parse(
      readFileSync(aiDataPath, 'utf-8'),
    ) as InspectAiTestCase;

    aiData.testCases.forEach((testCase, index) => {
      const prompt = testCase.prompt;
      test(
        `${source}-${repeatIndex}: assertion-${prompt.slice(0, 30)}...`,
        async () => {
          const { context } = await buildContext(
            path.join(__dirname, '../page-data/', aiData.testDataPath),
          );

          const { prompt, expected } = testCase;
          const result = await AiAssert({
            assertion: prompt,
            context,
          });
          console.log('assertion result', result);

          expect(typeof result?.content?.pass).toBe('boolean');
          if (result?.content?.pass !== expected) {
            throw new Error(
              `assertion failed: ${prompt} expected: ${expected}, actual: ${result?.content?.pass}, thought: ${result?.content?.thought}`,
            );
          }
        },
        3 * 60 * 1000,
      );
    });
  });
});
