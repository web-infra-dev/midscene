import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PlanningAIResponse } from '@midscene/core';
import { MATCH_BY_POSITION, getAIConfigInBoolean } from '@midscene/core/env';
import {
  base64Encoded,
  compositeElementInfoImg,
  imageInfoOfBase64,
} from '@midscene/shared/img';
import { parseContextFromWebPage } from '@midscene/web';

export const repeatTime = 1;

export type TestCase = {
  prompt: string;
  log?: string;
  response: Array<{ id: string; indexId: number }>;
  response_bbox?: [number, number, number, number];
  response_planning?: PlanningAIResponse;
  expected?: boolean;
  annotation_index_id?: number;
};

export type InspectAiTestCase = {
  testDataPath: string;
  testCases: Array<TestCase>;
};

export interface AiElementsResponse {
  elements: Array<
    | {
        id: string;
        reason?: string;
        text?: string;
      }
    | {
        position: {
          x: number;
          y: number;
        };
        reason?: string;
        text?: string;
      }
  >;
}

export interface TextAiElementResponse extends AiElementsResponse {
  response: Array<
    | {
        id: string;
      }
    | {
        position: {
          x: number;
          y: number;
        };
      }
  >;
  // for test
  caseIndex?: number;
  prompt: string;
  error?: string;
  spendTime: number;
  elementsSnapshot: Array<any>;
}

export async function runTestCases(
  testCases: Array<TestCase>,
  context: any,
  getAiResponse: (options: {
    description: string;
  }) => Promise<AiElementsResponse>,
) {
  let aiResponse: Array<TextAiElementResponse> = [];
  const { content: elementSnapshot } = context;
  for (let caseIndex = 0; caseIndex < testCases.length; caseIndex++) {
    const testCase = testCases[caseIndex];
    const startTime = Date.now();
    const msg = await getAiResponse({
      description: testCase.prompt,
    });
    const endTime = Date.now();
    const spendTime = endTime - startTime;
    if (msg.elements) {
      aiResponse.push({
        ...msg,
        prompt: testCase.prompt,
        response: msg.elements,
        caseIndex,
        spendTime,
        elementsSnapshot: msg.elements.map((element) => {
          const index = elementSnapshot.findIndex((item: any) => {
            if ('id' in element && item.nodeHashId === element.id) {
              return true;
            }
          });
          return elementSnapshot[index];
        }),
      });
    } else {
      aiResponse.push({
        error: `can't find element with description: ${testCase.prompt}`,
      } as any);
    }
  }

  aiResponse = aiResponse.sort((a, b) => {
    if (a.caseIndex !== undefined && b.caseIndex !== undefined) {
      return a.caseIndex - b.caseIndex;
    }
    return -1;
  });

  aiResponse.forEach((item) => {
    if ('caseIndex' in item) {
      item.caseIndex = undefined;
    }
  });

  const filterUnstableResult = aiResponse.map((aiInfo) => {
    const { elements = [], prompt, error = [], elementsSnapshot } = aiInfo;
    return {
      elements: elements.map((element, index) => {
        return {
          id: 'id' in element ? element.id.toString() : '',
          indexId: elementsSnapshot[index]?.indexId,
        };
      }),
      error,
      prompt,
    };
  });

  return {
    aiResponse,
    filterUnstableResult,
  };
}

export const repeat = (times: number, fn: (index: number) => void) => {
  for (let i = 1; i <= times; i++) {
    fn(i);
  }
};

export const repeatFile = (
  files: Array<string>,
  times: number,
  fn: (file: string, index: number) => void,
) => {
  for (const file of files) {
    repeat(times, (index) => {
      fn(file, index);
    });
  }
};

function ensureDirectoryExistence(filePath: string) {
  const dirname = path.dirname(filePath);
  if (existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  mkdirSync(dirname);
}

type WriteFileSyncParams = Parameters<typeof writeFileSync>;

export function writeFileSyncWithDir(
  filePath: string,
  content: WriteFileSyncParams[1],
  options: WriteFileSyncParams[2] = {},
) {
  ensureDirectoryExistence(filePath);
  writeFileSync(filePath, content, options);
}

export async function getCases(
  pageName: string,
  type = 'inspect',
): Promise<{
  path: string;
  content: InspectAiTestCase;
}> {
  const pageDataPath = path.join(
    __dirname,
    `../page-cases/${type}/${pageName}.json`,
  );
  const pageData = JSON.parse(readFileSync(pageDataPath, 'utf-8'));
  return {
    path: pageDataPath,
    content: pageData,
  };
}

export async function buildContextByImage(imagePath: string) {
  const screenshotBase64 = base64Encoded(imagePath);
  const size = await imageInfoOfBase64(screenshotBase64);

  const fakePage = {
    screenshotBase64: async () => screenshotBase64,
    getElementsNodeTree: async () => {
      return {
        node: null,
        children: [],
      };
    },
    url: () => {
      return 'https://unknown-url';
    },
    size: () => size,
  };
  return await parseContextFromWebPage(fakePage as any, {
    ignoreMarker: true,
  });
}

export async function buildContext(pageName: string) {
  const targetDir = path.join(__dirname, '../page-data/', pageName);
  const screenshotBase64Path = path.join(targetDir, 'input.png');
  const screenshotBase64 = base64Encoded(screenshotBase64Path);
  const size = await imageInfoOfBase64(screenshotBase64);

  const fakePage = {
    screenshotBase64: async () => screenshotBase64,
    getElementsNodeTree: async () => {
      const tree = JSON.parse(
        readFileSync(path.join(targetDir, 'element-tree.json'), 'utf-8'),
      );
      return tree;
    },
    url: () => {
      return 'https://unknown-url';
    },
    size: () => {
      return size;
    },
  };

  const context = await parseContextFromWebPage(fakePage as any, {
    ignoreMarker: getAIConfigInBoolean(MATCH_BY_POSITION),
  });
  return context;
}

export async function annotatePoints(
  imgBase64: string,
  points: Array<{
    indexId: number;
    points: [number, number, number, number];
  }>,
) {
  const markedImage = await compositeElementInfoImg({
    inputImgBase64: imgBase64,
    elementsPositionInfo: points.map((item, index) => {
      return {
        rect: {
          left: item.points[0],
          top: item.points[1],
          width: item.points[2] - item.points[0],
          height: item.points[3] - item.points[1],
        },
        indexId: item.indexId,
      };
    }),
    annotationPadding: 0,
  });
  return markedImage;
}
