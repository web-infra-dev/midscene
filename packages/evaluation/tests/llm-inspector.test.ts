import { writeFileSync } from 'node:fs';
import { describe } from 'node:test';
import {
  AiInspectElement,
  MIDSCENE_MODEL_NAME,
  getAIConfig,
  plan,
} from '@midscene/core';
import { MATCH_BY_POSITION } from '@midscene/core/env';
import { sleep } from '@midscene/core/utils';
import { saveBase64Image } from '@midscene/shared/img';
import dotenv from 'dotenv';
import { expect, test } from 'vitest';
import { TestResultCollector } from './test-analyzer';
import { annotatePoints, buildContext, getCases } from './util';

dotenv.config({
  debug: true,
  override: true,
});

const relocateAfterPlanning = false;
const failCaseThreshold = process.env.CI ? 1 : 0;
const testSources = [
  'todo',
  'online_order',
  'online_order_list',
  'taobao',
  'aweme-login',
  'aweme-play',
];

describe('ai inspect element', () => {
  ['locate'].forEach((runType) => {
    // ['inspect', 'planning'].forEach((runType) => {
    testSources.forEach((source) => {
      test(
        `${source}-${runType}: locate element`,
        async () => {
          const { path: aiDataPath, content: cases } = await getCases(
            source,
            'inspect',
          );

          const positionModeTag = getAIConfig(MATCH_BY_POSITION)
            ? 'by_coordinates'
            : 'by_element';
          const resultCollector = new TestResultCollector(
            `${source}-${runType}-${positionModeTag}`,
            getAIConfig(MIDSCENE_MODEL_NAME) || 'unspecified',
          );

          const annotations: Array<{
            indexId: number;
            points: [number, number, number, number];
          }> = [];
          for (const [index, testCase] of cases.testCases.entries()) {
            const context = await buildContext(source);

            const prompt = testCase.prompt;
            const startTime = Date.now();
            const result = await AiInspectElement({
              context,
              targetElementDescription: prompt,
            });

            if (process.env.UPDATE_ANSWER_DATA) {
              const { elementById } = result;

              if (result.rawResponse.bbox) {
                testCase.response_bbox = result.rawResponse.bbox;
                // biome-ignore lint/performance/noDelete: <explanation>
                delete (testCase as any).response_coordinates;
                annotations.push({
                  indexId: index + 1,
                  points: result.rawResponse.bbox,
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
              aiDataPath.split('/').pop() || '',
              testCase,
              result,
              Date.now() - startTime,
            );
          }

          await resultCollector.analyze(failCaseThreshold);
          await sleep(3 * 1000);
        },
        {
          timeout: 240 * 1000,
        },
      );
    });
  });
});

// if (runType === 'planning') {
//   // use planning to get quick answer to test element inspector
//   const res = await plan(
//     `follow the instruction (if any) or tap this element:${testCase.description}. Current time is ${new Date().toLocaleString()}.`,
//     {
//       context,
//     },
//   );

//   prompt = res.actions[0].locate?.prompt as string;
//   expect(prompt).toBeTruthy();

//   if (!relocateAfterPlanning) {
//     const matchedId = res.actions[0].locate?.id;
//     if (matchedId) {
//       const element = elementById(matchedId);
//       return {
//         elements: [
//           {
//             id: element.id,
//             reason: element.reason ?? '',
//             text: element.content ?? '',
//           },
//         ],
//       };
//     }

//     return {
//       elements: [],
//     };
//   }
// }
