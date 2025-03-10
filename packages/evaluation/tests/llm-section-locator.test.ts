import { writeFileSync } from 'node:fs';
import {
  AiInspectElement,
  MIDSCENE_MODEL_NAME,
  getAIConfig,
} from '@midscene/core';
import { AiLocateSection } from '@midscene/core/ai-model';
import { MIDSCENE_USE_QWEN_VL, getAIConfigInBoolean } from '@midscene/core/env';
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

const testSources = ['antd-tooltip'];

const resultCollector = new TestResultCollector(
  'section-locator',
  getAIConfig(MIDSCENE_MODEL_NAME) || 'unspecified',
);

let failCaseThreshold = 0;
if (process.env.CI && !getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)) {
  failCaseThreshold = 3;
}

afterAll(async () => {
  await resultCollector.analyze(failCaseThreshold);
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
        points: [number, number, number, number];
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
          const { sectionBbox } = result;

          if (sectionBbox) {
            const indexId = index + 1;
            testCase.response_bbox = sectionBbox;
            testCase.annotation_index_id = indexId;
            annotations.push({
              indexId,
              points: sectionBbox,
            });
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
