import { writeFileSync } from 'node:fs';
import Insight, {
  type Rect,
  MIDSCENE_MODEL_NAME,
  getAIConfig,
} from '@midscene/core';
import { sleep } from '@midscene/core/utils';
import { vlLocateMode } from '@midscene/shared/env';
import { saveBase64Image } from '@midscene/shared/img';
import dotenv from 'dotenv';
import { afterAll, expect, test } from 'vitest';
import { TestResultCollector } from '../src/test-analyzer';
import { annotateRects, buildContext, getCases } from './util';

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

let failCaseThreshold = 2;
if (process.env.CI) {
  failCaseThreshold = vlLocateMode() ? 2 : 3;
}

if (process.env.MIDSCENE_EVALUATION_EXPECT_VL) {
  expect(vlLocateMode()).toBeTruthy();
}

afterAll(async () => {
  await resultCollector.printSummary();
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
        rect: Rect;
      }> = [];
      for (const [index, testCase] of cases.testCases.entries()) {
        const context = await buildContext(source);

        const prompt = testCase.prompt;
        const startTime = Date.now();

        const insight = new Insight(context);

        let result: Awaited<ReturnType<typeof insight.locate>> | Error;
        try {
          result = await insight.locate({
            prompt,
            deepThink:
              vlLocateMode() === 'doubao-vision'
                ? undefined
                : testCase.deepThink,
          });
        } catch (error) {
          result = error as Error;
        }
        if (result instanceof Error) {
          resultCollector.addResult(
            source,
            testCase,
            result,
            Date.now() - startTime,
          );
          continue;
        }

        const { element, rect } = result;

        if (process.env.UPDATE_ANSWER_DATA) {
          // const { elementById } = context;

          if (rect) {
            const indexId = index + 1;
            testCase.response_rect = rect;
            testCase.annotation_index_id = indexId;
            annotations.push({
              indexId,
              rect,
            });

            // // biome-ignore lint/performance/noDelete: <explanation>
            // delete (testCase as any).response_bbox;
            // // biome-ignore lint/performance/noDelete: <explanation>
            // delete (testCase as any).response;
          }

          if (element) {
            testCase.response_element = {
              id: element.id,
              indexId: element.indexId,
            };
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

      await resultCollector.analyze(source, failCaseThreshold);
      await sleep(3 * 1000);
    },
    360 * 1000,
  );
});
