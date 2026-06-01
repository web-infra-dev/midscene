import { writeFileSync } from 'node:fs';
import { type PlanningAIResponse, type Rect, plan } from '@midscene/core';
import {
  ConversationHistory,
  adaptModelLocateResultToRect,
  getModelRuntime,
} from '@midscene/core/ai-model';
import {
  type DeviceAction,
  defineActionsFromInputPrimitives,
} from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import { globalModelConfigManager } from '@midscene/shared/env';
import { saveBase64Image } from '@midscene/shared/img';
import dotenv from 'dotenv';
import { afterEach, beforeAll, describe, test } from 'vitest';
import { TestResultCollector } from '../src/test-analyzer';
import { annotateRects, buildContext, getCases } from './util';
dotenv.config({
  debug: true,
  override: true,
});

const failCaseThreshold = process.env.CI ? 2 : 0;
const testSources = ['todo'];

let actionSpace: DeviceAction[] = [];

const planningModelConfig = globalModelConfigManager.getModelConfig('planning');
const planningModelRuntime = getModelRuntime(planningModelConfig);
const globalModelFamily = !!planningModelConfig.modelFamily;

beforeAll(async () => {
  actionSpace = [
    ...defineActionsFromInputPrimitives({
      pointer: {
        tap: async () => {},
      },
      keyboard: {
        typeText: async () => {},
        keyboardPress: async () => {},
        clearInput: async () => {},
      },
    }),
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

        const resultCollector = new TestResultCollector(
          `${caseGroupName}-planning`,
          planningModelConfig.modelName || 'unspecified',
        );

        for (const [, testCase] of cases.testCases.entries()) {
          const context = await buildContext(source);

          const prompt = testCase.prompt;
          const startTime = Date.now();

          const res = await plan(prompt, {
            context,
            actionSpace,
            modelRuntime: planningModelRuntime,
            conversationHistory: new ConversationHistory(),
            includeLocateInPlanning: false,
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

const { modelName } = planningModelConfig;

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

        for (const [index, testCase] of cases.testCases.entries()) {
          const context = await buildContext(source.replace('-vl', ''));

          const prompt = testCase.prompt;
          const startTime = Date.now();

          let res: PlanningAIResponse | Error;
          try {
            res = await plan(prompt, {
              context,
              actionContext: testCase.action_context,
              actionSpace,
              modelRuntime: planningModelRuntime,
              conversationHistory: new ConversationHistory({
                initialMessages: testCase.log
                  ? [{ role: 'assistant', content: testCase.log }]
                  : undefined,
              }),
              includeLocateInPlanning: true,
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
                const locateAdapter = planningModelRuntime.adapter.locate;
                if (locateAdapter.kind !== 'standard') {
                  throw new Error(
                    'planning evaluation requires a standard locate adapter',
                  );
                }
                testCase.response_rect = adaptModelLocateResultToRect(
                  res.action.locate.bbox,
                  {
                    width: context.shotSize.width,
                    height: context.shotSize.height,
                    resultAdapter: locateAdapter.resultAdapter,
                  },
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
