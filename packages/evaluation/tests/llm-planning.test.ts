import { writeFileSync } from 'node:fs';
import { type PlanningAIResponse, type Rect, plan } from '@midscene/core';
import { adaptBboxToRect } from '@midscene/core/ai-model';
import {
  type DeviceAction,
  defineActionInput,
  defineActionKeyboardPress,
  defineActionTap,
} from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import { globalModelConfigManager } from '@midscene/shared/env';
import { saveBase64Image } from '@midscene/shared/img';
import dotenv from 'dotenv';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { TestResultCollector } from '../src/test-analyzer';
import { annotateRects, buildContext, getCases } from './util';
dotenv.config({
  debug: true,
  override: true,
});

const failCaseThreshold = process.env.CI ? 2 : 0;
const testSources = ['todo'];

let actionSpace: DeviceAction[] = [];

let globalModelFamily = false;

beforeAll(async () => {
  const defaultModelConfig =
    globalModelConfigManager.getModelConfig('planning');
  const { modelFamily } = defaultModelConfig;
  globalModelFamily = !!modelFamily;

  expect(globalModelFamily).toBeTruthy();

  actionSpace = [
    defineActionTap(async () => {}),
    defineActionInput(async () => {}),
    defineActionKeyboardPress(async () => {}),
  ];
});

describe.skipIf(globalModelFamily)('ai planning - by element', () => {
  testSources.forEach((source) => {
    test(
      `${source}: planning`,
      async () => {
        const { path: aiDataPath, content: cases } = await getCases(
          source,
          'planning',
        );

        const caseGroupName = aiDataPath.split('/').pop() || '';

        const modelConfig = globalModelConfigManager.getModelConfig('planning');
        const { modelName } = modelConfig;

        const resultCollector = new TestResultCollector(
          `${caseGroupName}-planning`,
          modelName || 'unspecified',
        );

        for (const [, testCase] of cases.testCases.entries()) {
          const context = await buildContext(source);

          const prompt = testCase.prompt;
          const startTime = Date.now();

          const res = await plan(prompt, {
            context,
            interfaceType: 'puppeteer',
            actionSpace,
            modelConfig,
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

const { modelName } = globalModelConfigManager.getModelConfig('planning');

const resultCollector = new TestResultCollector(
  'planning',
  modelName || 'unspecified',
);

afterEach(async () => {
  await resultCollector.printSummary();
});

describe.skipIf(!globalModelFamily)('ai planning - by coordinates', () => {
  vlCases.forEach((source) => {
    test(
      `${source}: planning`,
      async () => {
        const { path: aiDataPath, content: cases } = await getCases(
          source,
          'planning',
        );

        const caseGroupName = aiDataPath.split('/').pop() || '';

        const annotations: Array<{
          indexId: number;
          rect: Rect;
        }> = [];

        const modelConfig = globalModelConfigManager.getModelConfig('planning');

        for (const [index, testCase] of cases.testCases.entries()) {
          const context = await buildContext(source.replace('-vl', ''));

          const prompt = testCase.prompt;
          const startTime = Date.now();

          let res: PlanningAIResponse | Error;
          try {
            res = await plan(prompt, {
              log: testCase.log,
              context,
              actionContext: testCase.action_context,
              interfaceType: 'puppeteer',
              actionSpace,
              modelConfig,
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
                  context.shotSize.width,
                  context.shotSize.height,
                  0,
                  0,
                  modelConfig.modelFamily,
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
              context.screenshot.base64,
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

        await resultCollector.analyze(caseGroupName, failCaseThreshold);
        await sleep(3 * 1000);
      },
      240 * 1000,
    );
  });
});
