import { writeFileSync } from 'node:fs';
import { MIDSCENE_MODEL_NAME, type Rect, getAIConfig } from '@midscene/core';
import { AiLocateSection } from '@midscene/core/ai-model';
import { vlLocateMode } from '@midscene/core/env';
import { sleep } from '@midscene/core/utils';
import { saveBase64Image } from '@midscene/shared/img';
import dotenv from 'dotenv';
import { afterAll, expect, test } from 'vitest';
import { TestResultCollector } from '../src/test-analyzer';
import { annotateRects, buildContext, getCases } from './util';

dotenv.config({
  debug: true,
  override: true,
});

const testSources = ['antd-tooltip'];

const resultCollector = new TestResultCollector(
  'section-locator',
  getAIConfig(MIDSCENE_MODEL_NAME) || 'unspecified',
);

let failCaseThreshold = 0;
if (process.env.CI && !vlLocateMode()) {
  failCaseThreshold = 3;
}

afterAll(async () => {
  await resultCollector.printSummary();
});

testSources.forEach((source) => {
  test(
    `${source}: locate section`,
    async () => {
      const { path: aiDataPath, content: cases } = await getCases(
        source,
        'section-locator',
      );

      const annotations: Array<{
        indexId: number;
        rect: Rect;
      }> = [];
      for (const [index, testCase] of cases.testCases.entries()) {
        const context = await buildContext(source);
        const prompt = testCase.prompt;
        const startTime = Date.now();
        const result = await AiLocateSection({
          context,
          sectionDescription: prompt,
        });

        if (process.env.UPDATE_ANSWER_DATA) {
          const { rect } = result;

          if (rect) {
            const indexId = index + 1;
            testCase.response_rect = rect;
            testCase.annotation_index_id = indexId;
            annotations.push({
              indexId,
              rect,
            });
          }

          // write testCase to file
          writeFileSync(aiDataPath, JSON.stringify(cases, null, 2));
        }
        if (annotations.length > 0) {
          const markedImage = await annotateRects(
            context.screenshotBase64,
            annotations.map((item) => item.rect),
          );
          await saveBase64Image({
            base64Data: markedImage,
            outputPath: `${aiDataPath}-coordinates-annotated.png`,
          });
        }

        resultCollector.addResult(
          source,
          testCase,
          result,
          Date.now() - startTime,
        );
      }

      await resultCollector.printSummary();
      await resultCollector.analyze(source, failCaseThreshold);
      await sleep(3 * 1000);
    },
    360 * 1000,
  );
});
