import { writeFileSync } from 'node:fs';
import Service, { type Rect } from '@midscene/core';
import { sleep } from '@midscene/core/utils';
import { globalModelConfigManager } from '@midscene/shared/env';
import { saveBase64Image } from '@midscene/shared/img';

import dotenv from 'dotenv';
import { afterAll, beforeAll, expect, test } from 'vitest';
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

let resultCollector: TestResultCollector;

const failCaseThreshold = 2;

beforeAll(async () => {
  const modelConfig = globalModelConfigManager.getModelConfig('default');

  const { modelFamily, modelName } = modelConfig;

  const positionModeTag = 'by_coordinates';
  resultCollector = new TestResultCollector(positionModeTag, modelName);
  expect(modelFamily).toBeTruthy();
});

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
        console.log(
          `Processing ${source} ${index + 1} of ${cases.testCases.length}`,
        );
        const context = await buildContext(source);

        const prompt = testCase.prompt;
        const startTime = Date.now();

        const service = new Service(context);

        let result: Awaited<ReturnType<typeof service.locate>> | Error;
        try {
          const modelConfig =
            globalModelConfigManager.getModelConfig('default');

          result = await service.locate(
            {
              prompt,
              deepThink:
                modelConfig.modelFamily === 'doubao-vision'
                  ? undefined
                  : testCase.deepThink,
            },
            {},
            modelConfig,
          );
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

        const shouldUpdateAnswerData = process.env.UPDATE_ANSWER_DATA;
        if (rect) {
          const indexId = index + 1;
          testCase.response_rect = rect;
          testCase.annotation_index_id = indexId;
          annotations.push({
            indexId,
            rect,
          });
        }

        if (shouldUpdateAnswerData) {
          // write testCase to file
          writeFileSync(aiDataPath, JSON.stringify(cases, null, 2));
        }
        if (annotations.length > 0) {
          const markedImage = await annotateRects(
            context.screenshotBase64,
            annotations.map((item) => item.rect),
          );
          const outputPath = shouldUpdateAnswerData
            ? `${aiDataPath}-coordinates-annotated.png`
            : `${aiDataPath}-coordinates-annotated.ignore.png`;
          await saveBase64Image({
            base64Data: markedImage,
            outputPath,
          });
          console.log(`Saved to ${outputPath}`);
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
