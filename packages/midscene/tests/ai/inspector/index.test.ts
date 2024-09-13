import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AiInspectElement } from '@/ai-model';
import { expect, test } from 'vitest';
import { repeatTime } from '../util';
import {
  TestResultAnalyzer,
  updateAggregatedResults,
} from './test-suite/test-analyzer';
import { getPageTestData, repeat, runTestCases } from './test-suite/util';

const testSources = ['todo', 'online_order'];

repeat(repeatTime, (repeatIndex) => {
  testSources.forEach((source) => {
    test(
      `${source}-${repeatIndex}: inspect element`,
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

        const { aiResponse } = await runTestCases(
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

        const analyzer = new TestResultAnalyzer(
          aiDataPath,
          aiData,
          aiResponse,
          repeatIndex,
        );
        const resultData = analyzer.analyze();

        updateAggregatedResults(source, resultData);

        console.log(`${source}-${repeatIndex}: inspect element -- result:`, {
          score: resultData.score,
          averageTime: resultData.averageTime,
          successCount: resultData.successCount,
          failCount: resultData.failCount,
        });

        expect(resultData.score).toBeGreaterThan(95);
      },
      {
        timeout: 90 * 1000,
      },
    );
  });
});
