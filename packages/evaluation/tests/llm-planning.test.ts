import { writeFileSync } from 'node:fs';
import {
  MIDSCENE_MODEL_NAME,
  type PlanningAIResponse,
  getAIConfig,
  plan,
} from '@midscene/core';
import { MIDSCENE_USE_QWEN_VL, getAIConfigInBoolean } from '@midscene/core/env';
import { sleep } from '@midscene/core/utils';
import { saveBase64Image } from '@midscene/shared/img';
import dotenv from 'dotenv';
import { describe, expect, test } from 'vitest';
import { TestResultCollector } from '../src/test-analyzer';
import { annotatePoints, buildContext, getCases } from './util';
dotenv.config({
  debug: true,
  override: true,
});

const failCaseThreshold = process.env.CI ? 1 : 0;
const testSources = ['todo'];

const vlMode = getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL);

describe.skipIf(vlMode)('ai planning - by element', () => {
  testSources.forEach((source) => {
    test(
      `${source}: planning`,
      async () => {
        const { path: aiDataPath, content: cases } = await getCases(
          source,
          'planning',
        );

        const resultCollector = new TestResultCollector(
          `${source}-planning`,
          getAIConfig(MIDSCENE_MODEL_NAME) || 'unspecified',
        );

        for (const [, testCase] of cases.testCases.entries()) {
          const context = await buildContext(source);

          const prompt = testCase.prompt;
          const startTime = Date.now();

          const res = await plan(prompt, {
            context,
          });

          if (process.env.UPDATE_ANSWER_DATA) {
            testCase.response_planning = res;
            writeFileSync(aiDataPath, JSON.stringify(cases, null, 2));
          }

          resultCollector.addResult(
            aiDataPath.split('/').pop() || '',
            testCase,
            res,
            Date.now() - startTime,
          );
        }

        await resultCollector.analyze(failCaseThreshold);
        await sleep(3 * 1000);
      },
      240 * 1000,
    );
  });
});

const vlCases = [
  'todo-vl',
  'aweme-login-vl',
  'antd-form-vl',
  'antd-tooltip-vl',
];
// const vlCases = ['aweme-login-vl'];

describe.skipIf(!vlMode)('ai planning - by coordinates', () => {
  vlCases.forEach((source) => {
    test(
      `${source}: planning`,
      async () => {
        const { path: aiDataPath, content: cases } = await getCases(
          source,
          'planning',
        );

        const resultCollector = new TestResultCollector(
          `${source}-planning`,
          getAIConfig(MIDSCENE_MODEL_NAME) || 'unspecified',
        );

        const annotations: Array<{
          indexId: number;
          points: [number, number, number, number];
        }> = [];

        for (const [index, testCase] of cases.testCases.entries()) {
          const context = await buildContext(source.replace('-vl', ''));

          const prompt = testCase.prompt;
          const startTime = Date.now();

          let res: PlanningAIResponse | Error;
          try {
            res = await plan(prompt, {
              log: testCase.log,
              context,
            });
          } catch (error) {
            res = error as Error;
          }

          if (process.env.UPDATE_ANSWER_DATA) {
            if (res instanceof Error) {
              testCase.response_planning = {
                error: res.message,
              } as any;
            } else {
              testCase.response_planning = res;
              if (res.action?.locate?.bbox) {
                const indexId = index + 1;
                testCase.response_bbox = res.action.locate.bbox;
                testCase.annotation_index_id = indexId;
                annotations.push({
                  indexId,
                  points: res.action.locate.bbox,
                });
              }
            }
            writeFileSync(aiDataPath, JSON.stringify(cases, null, 2));
          }

          if (annotations.length > 0) {
            const markedImage = await annotatePoints(
              context.screenshotBase64,
              annotations,
            );
            await saveBase64Image({
              base64Data: markedImage,
              outputPath: `${aiDataPath}-planning-coordinates-annotated.png`,
            });
          }

          resultCollector.addResult(
            aiDataPath.split('/').pop() || '',
            testCase,
            res,
            Date.now() - startTime,
          );
        }

        await resultCollector.analyze(failCaseThreshold);
        await sleep(3 * 1000);
      },
      240 * 1000,
    );
  });
});
