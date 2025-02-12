import assert from 'node:assert';
import { MATCH_BY_POSITION, getAIConfigInBoolean } from '@/env';
import { imageInfoOfBase64 } from '@/image';
import type { BaseElement, ElementTreeNode, Size, UIContext } from '@/types';
import { PromptTemplate } from '@langchain/core/prompts';
import { NodeType } from '@midscene/shared/constants';
import { descriptionOfTree, treeToList } from '@midscene/shared/extractor';
import { generateHashId } from '@midscene/shared/utils';
import type { ResponseFormatJSONSchema } from 'openai/resources';

const characteristic =
  'You are a versatile professional in software UI design and testing. Your outstanding contributions will impact the user experience of billions of users.';

const contextFormatIntro = `
The user will give you a screenshot and some of the texts on it. There may be some none-English characters (like Chinese) on it, indicating it's an non-English app. If some text is shown on screenshot but not introduced by the JSON description, use the information you see on screenshot.`;

export function systemPromptToLocateElement(
  queryPrompt: string,
  multi: boolean,
) {
  assert(queryPrompt, 'queryPrompt is required');
  return `
${characteristic}
${contextFormatIntro}

Based on the information you get, find ${
    multi ? 'one or more text elements' : 'ONE text element'
  } on the page.
Here is the description: ${queryPrompt}
  
Return in the following JSON format:
{
  "elements": [ // Leave it an empty array when no element is found
    { 
      "id": "id of the element, like 123", 
    },
    // more ...
  ], 
  errors?: [], // string[], error message if any
}
`;
}

export function systemPromptToExtract() {
  return `
You are a versatile professional in software UI design and testing. Your outstanding contributions will impact the user experience of billions of users.

The user will give you a screenshot, the contents of it (optional), and some data requirements in DATA_DEMAND. You need to extract the data according to the DATA_DEMAND.

Return in the following JSON format:
{
  data: any, // the extracted data from extract_data_from_UI skill. Make sure both the value and scheme meet the DATA_DEMAND. If you want to write some description in this field, use the same language as the DATA_DEMAND.
  errors: [], // string[], error message if any
}
`;
}

export const extractDataPrompt = new PromptTemplate({
  template: `
pageDescription: {pageDescription}

Use your extract_data_from_UI skill to find the following data, placing it in the \`data\` field
DATA_DEMAND start:
=====================================
{dataKeys}

{dataQuery}
=====================================
DATA_DEMAND ends.
  `,
  inputVariables: ['pageDescription', 'dataKeys', 'dataQuery'],
});

export const extractDataSchema: ResponseFormatJSONSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'extract_data',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: 'The extracted data from extract_data_from_UI skill',
        },
        errors: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Error messages, if any',
        },
      },
      required: ['data', 'errors'],
      additionalProperties: false,
    },
  },
};

export function systemPromptToAssert() {
  return `
${characteristic}
User will give an assertion, and some information about the page. Based on the information you get, tell whether the assertion is truthy.

Return in the following JSON format:
{
  thought: string, // string, the thought of the assertion. Should in the same language as the assertion.
  pass: true, // true or false, whether the assertion is truthy
}
`;
}

export const assertSchema: ResponseFormatJSONSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'assert',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        thought: {
          type: 'string',
          description: 'The thought process behind the assertion',
        },
        pass: {
          type: 'boolean',
          description: 'Whether the assertion passed or failed',
        },
      },
      required: ['thought', 'pass'],
      additionalProperties: false,
    },
  },
};

export function describeSize(size: Size) {
  return `${size.width} x ${size.height}`;
}

export function describeElement(
  elements: (Pick<BaseElement, 'rect' | 'content'> & { id: string })[],
) {
  const sliceLength = 80;
  return elements
    .map((item) =>
      [
        item.id,
        item.rect.left,
        item.rect.top,
        item.rect.left + item.rect.width,
        item.rect.top + item.rect.height,
        item.content.length > sliceLength
          ? `${item.content.slice(0, sliceLength)}...`
          : item.content,
      ].join(', '),
    )
    .join('\n');
}

export function elementByPositionWithElementInfo(
  treeRoot: ElementTreeNode<BaseElement>,
  position: {
    x: number;
    y: number;
  },
) {
  assert(typeof position !== 'undefined', 'position is required for query');

  const matchingElements: BaseElement[] = [];

  function dfs(node: ElementTreeNode<BaseElement>) {
    if (node?.node) {
      const item = node.node;
      if (
        item.rect.left <= position.x &&
        position.x <= item.rect.left + item.rect.width &&
        item.rect.top <= position.y &&
        position.y <= item.rect.top + item.rect.height
      ) {
        matchingElements.push(item);
      }
    }

    for (const child of node.children) {
      dfs(child);
    }
  }

  dfs(treeRoot);

  if (matchingElements.length === 0) {
    return undefined;
  }

  // Find the smallest element by area
  return matchingElements.reduce((smallest, current) => {
    const smallestArea = smallest.rect.width * smallest.rect.height;
    const currentArea = current.rect.width * current.rect.height;
    return currentArea < smallestArea ? current : smallest;
  });
}

export const samplePageDescription = () => {
  return getAIConfigInBoolean(MATCH_BY_POSITION)
    ? ''
    : `
And the page is described as follows:
====================
The size of the page: 1280 x 720
Some of the elements are marked with a rectangle in the screenshot corresponding to the markerId, some are not.

Description of all the elements in screenshot:
<div id="969f1637" markerId="1" left="100" top="100" width="100" height="100"> // The markerId indicated by the rectangle label in the screenshot
  <h4 id="b211ecb2" markerId="5" left="150" top="150" width="90" height="60">
    The username is accepted
  </h4>
  ...many more
</div>
====================
`;
};

export async function describeUserPage<
  ElementType extends BaseElement = BaseElement,
>(
  context: Omit<UIContext<ElementType>, 'describer'>,
  opt?: {
    truncateTextLength?: number;
    filterNonTextContent?: boolean;
  },
) {
  const { screenshotBase64 } = context;
  let width: number;
  let height: number;

  if (context.size) {
    ({ width, height } = context.size);
  } else {
    const imgSize = await imageInfoOfBase64(screenshotBase64);
    ({ width, height } = imgSize);
  }

  const treeRoot = context.tree;
  // dfs tree, save the id and element info
  const idElementMap: Record<string, ElementType> = {};
  const flatElements: ElementType[] = treeToList(treeRoot);
  flatElements.forEach((element) => {
    idElementMap[element.id] = element;
    if (typeof element.indexId !== 'undefined') {
      idElementMap[`${element.indexId}`] = element;
    }
  });

  const contentTree = await descriptionOfTree(
    treeRoot,
    opt?.truncateTextLength,
    opt?.filterNonTextContent,
  );

  // if match by position, don't need to provide the page description
  const pageJSONDescription = getAIConfigInBoolean(MATCH_BY_POSITION)
    ? ''
    : `Some of the elements are marked with a rectangle in the screenshot, some are not. \n The page elements tree:\n${contentTree}`;
  const sizeDescription = describeSize({ width, height });

  return {
    description: `The size of the page: ${sizeDescription} \n ${pageJSONDescription}`,
    elementById(id: string) {
      assert(typeof id !== 'undefined', 'id is required for query');
      const item = idElementMap[`${id}`];
      return item;
    },
    elementByPosition(
      position: { x: number; y: number },
      size: { width: number; height: number },
    ) {
      // console.log('elementByPosition', { position, size });
      return elementByPositionWithElementInfo(treeRoot, position);
    },
    insertElementByPosition(position: { x: number; y: number }) {
      const rect = {
        left: Math.max(position.x - 4, 0),
        top: Math.max(position.y - 4, 0),
        width: 8,
        height: 8,
      };
      const id = generateHashId(rect);
      const element = {
        id,
        attributes: { nodeType: NodeType.POSITION },
        rect,
        content: '',
        center: [position.x, position.y],
      } as ElementType;

      treeRoot.children.push({
        node: element,
        children: [],
      });
      flatElements.push(element);
      idElementMap[id] = element;
      return element;
    },
    size: { width, height },
  };
}
