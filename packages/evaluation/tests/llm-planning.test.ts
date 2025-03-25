import { writeFileSync } from 'node:fs';
import {
  MIDSCENE_MODEL_NAME,
  type PlanningAIResponse,
  type Rect,
  getAIConfig,
  plan,
} from '@midscene/core';
import { adaptBboxToRect } from '@midscene/core/ai-model';
import { vlLocateMode } from '@midscene/core/env';
import { sleep } from '@midscene/core/utils';
import { saveBase64Image } from '@midscene/shared/img';
import dotenv from 'dotenv';
import { describe, expect, test } from 'vitest';
import { TestResultCollector } from '../src/test-analyzer';
import { annotateRects, buildContext, getCases } from './util';
dotenv.config({
  debug: true,
  override: true,
});

if (process.env.MIDSCENE_EVALUATION_EXPECT_VL) {
  expect(vlLocateMode()).toBeTruthy();
}

const failCaseThreshold = process.env.CI ? 2 : 0;
const testSources = ['todo'];

const vlMode = vlLocateMode();

describe.skipIf(vlMode)('ai planning - by element', () => {
  testSources.forEach((source) => {
    test(
      `${source}: planning`,
      async () => {
        const { path: aiDataPath, content: cases } = await getCases(
          source,
          'planning',
        );

        const caseGroupName = aiDataPath.split('/').pop() || '';

        const resultCollector = new TestResultCollector(
          `${caseGroupName}-planning`,
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
            caseGroupName,
            testCase,
            res,
            Date.now() - startTime,
          );
        }

        await resultCollector.printSummary();
        await resultCollector.analyze(caseGroupName, failCaseThreshold);
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

describe.skipIf(!vlMode)('ai planning - by coordinates', () => {
  vlCases.forEach((source) => {
    test(
      `${source}: planning`,
      async () => {
        const { path: aiDataPath, content: cases } = await getCases(
          source,
          'planning',
        );

        const caseGroupName = aiDataPath.split('/').pop() || '';

        const resultCollector = new TestResultCollector(
          `${caseGroupName}-planning`,
          getAIConfig(MIDSCENE_MODEL_NAME) || 'unspecified',
        );

        const annotations: Array<{
          indexId: number;
          rect: Rect;
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
                testCase.response_rect = adaptBboxToRect(
                  res.action.locate.bbox,
                  context.size.width,
                  context.size.height,
                );
                testCase.annotation_index_id = indexId;
                annotations.push({
                  indexId,
                  rect: testCase.response_rect,
                });
              }
            }
            writeFileSync(aiDataPath, JSON.stringify(cases, null, 2));
          }

          if (annotations.length > 0) {
            const markedImage = await annotateRects(
              context.screenshotBase64,
              annotations.map((item) => item.rect),
            );
            await saveBase64Image({
              base64Data: markedImage,
              outputPath: `${aiDataPath}-planning-coordinates-annotated.png`,
            });
          }

          resultCollector.addResult(
            caseGroupName,
            testCase,
            res,
            Date.now() - startTime,
          );
        }

        await resultCollector.printSummary();
        await resultCollector.analyze(caseGroupName, failCaseThreshold);
        await sleep(3 * 1000);
      },
      240 * 1000,
    );
  });
});
