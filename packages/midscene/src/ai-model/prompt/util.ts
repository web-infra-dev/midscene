import assert from 'node:assert';
import { MATCH_BY_POSITION, getAIConfig } from '@/env';
import { imageInfoOfBase64 } from '@/image';
import type { BaseElement, ElementTreeNode, Size, UIContext } from '@/types';
import { PromptTemplate } from '@langchain/core/prompts';
import { NodeType } from '@midscene/shared/constants';
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
The user will give you a screenshot and the contents of it. There may be some none-English characters (like Chinese) on it, indicating it's an non-English app.

You have the following skills:

skill name: extract_data_from_UI
related input: DATA_DEMAND
skill content: 
* User will give you some data requirements in DATA_DEMAND. Consider the UI context, follow the user's instructions, and provide comprehensive data accordingly.
* There may be some special commands in DATA_DEMAND, please pay extra attention
  - LOCATE_ONE_ELEMENT and LOCATE_ONE_OR_MORE_ELEMENTS: if you see a description that mentions the keyword LOCATE_ONE_ELEMENT
  - LOCATE_ONE_OR_MORE_ELEMENTS(e.g. follow LOCATE_ONE_ELEMENT : i want to find ...), it means user wants to locate a specific element meets the description. 

Return in this way: prefix + the id / comma-separated ids, for example: LOCATE_ONE_ELEMENT/1 , LOCATE_ONE_OR_MORE_ELEMENTS/1,2,3 . If not found, keep the prefix and leave the suffix empty, like LOCATE_ONE_ELEMENT/ .

Return in the following JSON format:
{
  language: "en", // "en" or "zh", the language of the page. Use the same language to describe section name, description, and similar fields.
  data: any, // the extracted data from extract_data_from_UI skill. Make sure both the value and scheme meet the DATA_DEMAND.
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
        language: {
          type: 'string',
          enum: ['en', 'zh'],
          description: 'The language of the page',
        },
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
      required: ['language', 'data', 'errors'],
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

export function describeTextFormat() {
  // use `right` and `bottom` to help AI reduce the feasibility of performing computations
  return `
The following texts elements are formatted in the following way: 
id(string), left, top, right, bottom, content(may be truncated)`;
}

type PromptElementType = {
  id: BaseElement['id'];
  attributes: BaseElement['attributes'];
  rect: BaseElement['rect'];
  content: BaseElement['content'];
};

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

export function truncateText(
  text: string | number | object | undefined,
  maxLength = 150,
) {
  if (typeof text === 'undefined') {
    return '';
  }

  if (typeof text === 'object') {
    text = JSON.stringify(text);
  }

  if (typeof text === 'number') {
    return text.toString();
  }

  if (typeof text === 'string' && text.length > maxLength) {
    return `${text.slice(0, maxLength)}...`;
  }

  if (typeof text === 'string') {
    return text.trim();
  }

  return '';
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
        item.attributes.nodeType !== NodeType.CONTAINER &&
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

export const samplePageDescription = `
The size of the page: 1280 x 720
Some of the elements are marked with a rectangle in the screenshot, some are not.

Description of all the elements in screenshot:
<div id="969f1637" markerId="1"> // The markerId indicated by the rectangle label in the screenshot
  <h4 id="b211ecb2" markerId="5" >
    The username is accepted
  </h4>
  ...many more
</div>
`;

export function trimAttributes(
  attributes: Record<string, any>,
  truncateTextLength?: number,
) {
  const tailorAttributes = Object.keys(attributes).reduce(
    (res, currentKey: string) => {
      const attributeVal = (attributes as any)[currentKey];
      if (
        currentKey === 'style' ||
        currentKey === 'src' ||
        currentKey === 'htmlTagName' ||
        currentKey === 'nodeType'
      ) {
        return res;
      }

      res[currentKey] = truncateText(attributeVal, truncateTextLength);
      return res;
    },
    {} as BaseElement['attributes'],
  );
  return tailorAttributes;
}

const nodeSizeThreshold = 4;
export async function descriptionOfTree<
  ElementType extends BaseElement = BaseElement,
>(
  tree: ElementTreeNode<ElementType>,
  truncateTextLength?: number,
  filterNonTextContent = false,
) {
  const attributesString = (kv: Record<string, any>) => {
    return Object.entries(kv)
      .map(
        ([key, value]) => `${key}="${truncateText(value, truncateTextLength)}"`,
      )
      .join(' ');
  };

  function buildContentTree(
    node: ElementTreeNode<ElementType>,
    indent = 0,
  ): string {
    let before = '';
    let contentWithIndent = '';
    let after = '';
    let emptyNode = true;
    const indentStr = '  '.repeat(indent);

    let children = '';
    for (let i = 0; i < (node.children || []).length; i++) {
      const childContent = buildContentTree(node.children[i], indent + 1);
      if (childContent) {
        children += `\n${childContent}`;
      }
    }

    if (
      node.node &&
      node.node.rect.width > nodeSizeThreshold &&
      node.node.rect.height > nodeSizeThreshold &&
      (!filterNonTextContent || (filterNonTextContent && node.node.content))
    ) {
      emptyNode = false;
      let nodeTypeString: string;
      if (node.node.attributes?.htmlTagName) {
        nodeTypeString = node.node.attributes.htmlTagName.replace(/[<>]/g, '');
      } else {
        nodeTypeString = node.node.attributes.nodeType
          .replace(/\sNode$/, '')
          .toLowerCase();
      }
      const markerId = (node.node as any).indexId;
      const markerIdString = markerId ? `markerId="${markerId}"` : '';
      const rectAttribute = node.node.rect
        ? {
            left: node.node.rect.left,
            top: node.node.rect.top,
            width: node.node.rect.width,
            height: node.node.rect.height,
          }
        : {};
      before = `<${nodeTypeString} id="${node.node.id}" ${markerIdString} ${attributesString(trimAttributes(node.node.attributes || {}, truncateTextLength))} ${attributesString(rectAttribute)}>`;
      const content = truncateText(node.node.content, truncateTextLength);
      contentWithIndent = content ? `\n${indentStr}  ${content}` : '';
      after = `</${nodeTypeString}>`;
    } else if (!filterNonTextContent) {
      if (!children.trim().startsWith('<>')) {
        before = '<>';
        contentWithIndent = '';
        after = '</>';
      }
    }

    if (emptyNode && !children.trim()) {
      return '';
    }

    const result = `${indentStr}${before}${contentWithIndent}${children}\n${indentStr}${after}`;
    if (result.trim()) {
      return result;
    }
    return '';
  }

  return buildContentTree(tree);
}

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
  const flatElements: ElementType[] = [];
  function dfsTree(node: ElementTreeNode<ElementType>) {
    if (node?.node) {
      idElementMap[node.node.id] = node.node;
      flatElements.push(node.node);
    }
    for (let i = 0; i < (node.children || []).length; i++) {
      dfsTree(node.children[i]);
    }
  }
  dfsTree(treeRoot);

  const contentTree = await descriptionOfTree(
    treeRoot,
    opt?.truncateTextLength,
    opt?.filterNonTextContent,
  );

  // if match by position, don't need to provide the page description
  const pageJSONDescription = getAIConfig(MATCH_BY_POSITION)
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
      console.log('elementByPosition', { position, size });
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
