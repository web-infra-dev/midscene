import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AiInspectElement } from '@/ai-model';
import { expect, test } from 'vitest';
import { repeatTime } from '../util';
import {
  getPageTestData,
  repeat,
  runTestCases,
  writeFileSyncWithDir,
} from './util';

const testSources = ['todo', 'online_order'];

const updateAiData = process.env.UPDATE_AI_DATA;

repeat(repeatTime, (repeatIndex) => {
  testSources.forEach((source) => {
    test(
      `${source}: inspect element`,
      async () => {
        const aiDataPath = path.join(__dirname, `ai-data/${source}.json`);
        const aiData = JSON.parse(readFileSync(aiDataPath, 'utf-8'));

        const { context } = await getPageTestData(
          path.join(__dirname, aiData.testDataPath),
        );

        const testCases = aiData.testCases.map(
          (testCase: { elementDescription: string; multi: boolean }) => ({
            description: testCase.elementDescription,
            multi: testCase.multi,
          }),
        );

        const { aiResponse, filterUnstableResult } = await runTestCases(
          testCases,
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

        writeFileSyncWithDir(
          path.join(
            __dirname,
            `__ai_responses__/${source}-inspector-element-${repeatIndex}.json`,
          ),
          JSON.stringify(aiResponse, null, 2),
          { encoding: 'utf-8' },
        );

        aiData.testCases.forEach(
          (
            testCase: {
              description: any;
              elements: any[];
            },
            index: number,
          ) => {
            let successCount = 0;
            let failCount = 0;
            const successResults: { index: number; elements: any[] }[] = [];
            const failResults: {
              index: number;
              expected: any[];
              actual: any[];
              elementDescription: string;
            }[] = [];

            aiResponse.forEach((result, idx) => {
              if (
                JSON.stringify(result.elements) ===
                JSON.stringify(testCase.elements)
              ) {
                successCount++;
                successResults.push({ index: idx, elements: result.elements });
              } else {
                failCount++;
                failResults.push({
                  index: idx,
                  expected: testCase.elements,
                  actual: result.elements.map((element: any) => ({
                    id: element.id,
                  })),
                  elementDescription: result.prompt,
                });

                if (updateAiData) {
                  testCase.elements = result.elements.map((element: any) => ({
                    id: element.id,
                  }));
                }
              }
            });

            const totalTime = aiResponse.reduce(
              (acc, cur) => acc + cur.spendTime,
              0,
            );
            const totalCount = successCount + failCount;
            const score = (successCount / totalCount) * 100;
            const averageTime = totalTime / totalCount;

            const resultData = {
              score,
              averageTime: `${(averageTime / 1000).toFixed(2)}s`,
              successCount,
              failCount,
              successResults,
              failResults,
            };

            writeFileSyncWithDir(
              path.join(
                __dirname,
                `__ai_responses__/${source}-inspector-element-result-${repeatIndex}-${index}.json`,
              ),
              JSON.stringify(resultData, null, 2),
              { encoding: 'utf-8' },
            );

            expect(successCount).toBeGreaterThan(0);
          },
        );

        if (updateAiData) {
          writeFileSync(aiDataPath, JSON.stringify(aiData, null, 2), 'utf-8');
        }
      },
      {
        timeout: 90 * 1000,
      },
    );
  });
});
