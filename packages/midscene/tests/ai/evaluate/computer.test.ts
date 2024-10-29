import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { callToGetJSONObject } from '@/ai-model';
import { AIActionType } from '@/ai-model/common';
import { describe, expect, it } from 'vitest';
import { type InspectAiTestCase, getPageTestData } from './test-suite/util';

const testSources = [
  //   'todo',
  'online_order',
  //   'online_order_list',
  //   'taobao',
  //   'aweme_login',
  // 'aweme_play',
];
describe(
  'automation - computer',
  () => {
    it('basic run', async () => {
      const result: Array<{ expectation: any; reality: string }> = [];
      for (const source of testSources) {
        const aiDataPath = path.join(
          __dirname,
          `ai-data/inspect/${source}.json`,
        );
        const aiData = JSON.parse(
          readFileSync(aiDataPath, 'utf-8'),
        ) as InspectAiTestCase;
        const res = aiData.testCases.map(async (testCase) => {
          const { context } = await getPageTestData(
            path.join(__dirname, aiData.testDataPath),
          );
          const res = await callToGetJSONObject(
            [
              {
                role: 'system',
                content: `<SYSTEM_CAPABILITY>
                    * 根据截图和描述，找到特定的坐标位置
                    </SYSTEM_CAPABILITY>
            `,
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: context.originalScreenshotBase64,
                    },
                  },
                  {
                    type: 'text',
                    text: `
            pageDescription: ${context.size} \n
        
            Here is the item user want to find. Just go ahead:
            =====================================
            找到${testCase.prompt}位置，x/y坐标
            =====================================
            `,
                  },
                ],
              },
            ],
            AIActionType.ASSERT,
          );
          result.push({
            expectation: {
              prompt: testCase.prompt,
              rect: context.content.find(
                (item: any) => testCase.response[0].indexId === item.indexId,
              ).rect,
            },
            reality: res as string,
          });
          // console.log(
          //   '要查找的坐标',
          //   context.content.find((item: any) => item.indexId === 21).rect,
          // );
          // console.log('实际坐标信息：', res);
        });
        await Promise.all(res);
        // Write result to file
        const resultFilePath = path.join(
          __dirname,
          `${source}-computer-result.json`,
        );
        const resultDir = path.dirname(resultFilePath);

        if (!existsSync(resultDir)) {
          mkdirSync(resultDir, { recursive: true });
        }

        writeFileSync(resultFilePath, JSON.stringify(result, null, 2), 'utf-8');
        console.log(`Result written to ${resultFilePath}`);
      }
    });
  },
  {
    timeout: 100000,
  },
);
