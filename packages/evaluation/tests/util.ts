import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PlanningAIResponse, Rect } from '@midscene/core';
import {
  annotateRects,
  imageInfoOfBase64,
  localImg2Base64,
} from '@midscene/shared/img';

export { annotateRects };

export const repeatTime = 1;

export type TestCase = {
  prompt: string;
  deepThink?: boolean;
  log?: string;
  response_element?: { id: string; indexId?: number };
  response_rect?: Rect;
  response_planning?: PlanningAIResponse;
  expected?: boolean;
  annotation_index_id?: number;
  action_context?: string;
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

export function getCases(
  pageName: string,
  type = 'inspect',
): {
  path: string;
  content: InspectAiTestCase;
} {
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

export async function buildContext(pageName: string) {
  const targetDir = path.join(__dirname, '../page-data/', pageName);
  const screenshotBase64Path = path.join(targetDir, 'input.png');
  const screenshotBase64 = localImg2Base64(screenshotBase64Path);
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

  const context = await WebPageContextParser(fakePage as any, {});
  return context;
}
