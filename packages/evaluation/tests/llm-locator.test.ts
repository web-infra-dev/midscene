import { writeFileSync } from 'node:fs';
import {
  AiLocateElement,
  MIDSCENE_MODEL_NAME,
  getAIConfig,
} from '@midscene/core';
import { vlLocateMode } from '@midscene/core/env';
import { sleep } from '@midscene/core/utils';
import { saveBase64Image } from '@midscene/shared/img';
import dotenv from 'dotenv';
import { afterAll, expect, test } from 'vitest';
import { TestResultCollector } from '../src/test-analyzer';
import { annotatePoints, buildContext, getCases } from './util';

dotenv.config({
  debug: true,
  override: true,
});

const testSources = [
  'antd-carousel',
  'todo',
  'online_order',
  'online_order_list',
  'taobao',
  'aweme-login',
  'aweme-play',
];

const positionModeTag = vlLocateMode() ? 'by_coordinates' : 'by_element';
const resultCollector = new TestResultCollector(
  positionModeTag,
  getAIConfig(MIDSCENE_MODEL_NAME) || 'unspecified',
);

let failCaseThreshold = 0;
if (process.env.CI && !vlLocateMode()) {
  failCaseThreshold = 3;
}

if (process.env.MIDSCENE_EVALUATION_EXPECT_VL) {
  expect(vlLocateMode()).toBeTruthy();
}

afterAll(async () => {
  await resultCollector.analyze(failCaseThreshold);
});

testSources.forEach((source) => {
  test(
    `${source}: locate element`,
    async () => {
      const { path: aiDataPath, content: cases } = await getCases(
        source,
        'inspect',
      );

      const annotations: Array<{
        indexId: number;
        points: [number, number, number, number];
      }> = [];
      for (const [index, testCase] of cases.testCases.entries()) {
        const context = await buildContext(source);

        const prompt = testCase.prompt;
        const startTime = Date.now();
        const result = await AiLocateElement({
          context,
          targetElementDescription: prompt,
        });

        if (process.env.UPDATE_ANSWER_DATA) {
          const { elementById } = result;

          if (result.parseResult.bbox) {
            const indexId = index + 1;
            testCase.response_bbox = result.parseResult.bbox;
            testCase.annotation_index_id = indexId;
            // biome-ignore lint/performance/noDelete: <explanation>
            delete (testCase as any).response_coordinates;
            annotations.push({
              indexId,
              points: result.parseResult.bbox,
            });
          } else if (result.parseResult.elements.length > 0) {
            const element = elementById(result.parseResult.elements[0].id);
            expect(element).toBeTruthy();

            testCase.response = [
              {
                id: element!.id,
                indexId: element!.indexId || -1,
              },
            ];
          }

          // write testCase to file
          writeFileSync(aiDataPath, JSON.stringify(cases, null, 2));
        }
        if (annotations.length > 0) {
          const markedImage = await annotatePoints(
            context.screenshotBase64,
            annotations,
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

      await resultCollector.analyze(failCaseThreshold);
      await sleep(3 * 1000);
    },
    360 * 1000,
  );
});
