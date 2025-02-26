import { writeFileSync } from 'node:fs';
import {
  MIDSCENE_MODEL_NAME,
  PlanningLocateParam,
  getAIConfig,
  plan,
} from '@midscene/core';
import {
  MATCH_BY_POSITION,
  MIDSCENE_USE_QWEN_VL,
  getAIConfigInBoolean,
} from '@midscene/core/env';
import { sleep } from '@midscene/core/utils';
import dotenv from 'dotenv';
import { describe, expect, test } from 'vitest';
import { TestResultCollector } from './test-analyzer';
import { buildContext, getCases } from './util';

dotenv.config({
  debug: true,
  override: true,
});

const failCaseThreshold = process.env.CI ? 1 : 0;
const testSources = [
  'todo',
  // 'online_order',
  // 'online_order_list',
  // 'taobao',
  // 'aweme-login',
  // 'aweme-play',
];

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

const vlCases = ['todo-vl', 'aweme-login-vl', 'antd-form-vl'];

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

        for (const [, testCase] of cases.testCases.entries()) {
          const context = await buildContext(source.replace('-vl', ''));

          const prompt = testCase.prompt;
          const startTime = Date.now();

          const res = await plan(prompt, {
            log: testCase.log,
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
