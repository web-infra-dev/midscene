import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe } from 'node:test';
import { AiInspectElement, plan } from '@midscene/core';
import { buildContext } from '@midscene/core/evaluation';
import dotenv from 'dotenv';
import { afterAll, expect, test } from 'vitest';
import { TestResultAnalyzer, updateAggregatedResults } from './test-analyzer';
import { type InspectAiTestCase, repeat, runTestCases } from './util';
import { repeatTime } from './util';

dotenv.config({
  debug: true,
  override: true,
});

const relocateAfterPlanning = false;
const failCaseThreshold = process.env.CI ? 1 : 0;
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
  ['inspect', 'planning'].forEach((runType) => {
    testSources.forEach((source) => {
      test(
        `${source}-${runType}: locate element`,
        async () => {
          const aiDataPath = path.join(
            __dirname,
            `../page-cases/inspect/${source}.json`,
          );
          const pageData = JSON.parse(
            readFileSync(aiDataPath, 'utf-8'),
          ) as InspectAiTestCase;

          const { context } = await buildContext(
            path.join(__dirname, '../page-data/', pageData.testDataPath),
          );

          const { elementById } = await context.describer();

          const { aiResponse } = await runTestCases(
            pageData.testCases,
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

                prompt = res.actions[0].locate?.prompt as string;
                expect(prompt).toBeTruthy();

                if (!relocateAfterPlanning) {
                  const matchedId = res.actions[0].locate?.id;
                  if (matchedId) {
                    const element = elementById(matchedId);
                    return {
                      elements: [
                        {
                          id: element.id,
                          reason: element.reason ?? '',
                          text: element.content ?? '',
                        },
                      ],
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
                  ? [
                      {
                        ...parseResult.elements[0],
                        reason: parseResult.elements[0].reason ?? '',
                        text: parseResult.elements[0].text ?? '',
                      },
                    ]
                  : [],
              };
            },
          );

          const analyzer = new TestResultAnalyzer(
            context,
            aiDataPath,
            aiData,
            aiResponse,
            runType === 'planning' ? 1 : 0,
          );
          const resultData = analyzer.analyze();

          updateAggregatedResults(source, resultData);

          testResult.push({
            path: `${source}-${runType}-result:`,
            result: {
              score: resultData.score,
              averageTime: resultData.averageTime,
              successCount: resultData.successCount,
              failCount: resultData.failCount,
            },
          });
          expect(resultData.successCount).toBeGreaterThan(0);
          // await sleep(20 * 1000);
          expect(resultData.failCount).toBeLessThanOrEqual(
            source === 'aweme_play' ? 2 : failCaseThreshold,
          );

          await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
        },
        {
          timeout: 120 * 1000,
        },
      );
    });
  });
});
