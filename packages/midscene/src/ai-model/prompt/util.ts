import assert from 'node:assert';
import { MATCH_BY_POSITION, getAIConfig } from '@/env';
import { imageInfoOfBase64 } from '@/image';
import type { BaseElement, Size, UIContext } from '@/types';
import type { ResponseFormatJSONSchema } from 'openai/resources';

const characteristic =
  'You are a versatile professional in software UI design and testing. Your outstanding contributions will impact the user experience of billions of users.';

const contextFormatIntro = `
The user will give you a screenshot and some of the texts on it. There may be some none-English characters (like Chinese) on it, indicating it's an non-English app. If some text is shown on screenshot but not introduced by the JSON description, use the information you see on screenshot.`;

const ONE_ELEMENT_LOCATOR_PREFIX = 'LOCATE_ONE_ELEMENT';
const ELEMENTS_LOCATOR_PREFIX = 'LOCATE_ONE_OR_MORE_ELEMENTS';
const SECTION_MATCHER_FLAG = 'SECTION_MATCHER_FLAG/';

export function systemPromptToFindElement(queryPrompt: string, multi: boolean) {
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
${contextFormatIntro}

Based on the information you get, Return assertion judgment:

Return in the following JSON format:
{
  thought: string, // string, the thought of the assertion. Should in the same language as the assertion.
  pass: true, // true or false, whether the assertion is passed
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

export function truncateText(text: string, maxLength = 100) {
  if (text && text.length > maxLength) {
    return `${text.slice(0, maxLength)}...`;
  }

  if (typeof text === 'string') {
    return text.trim();
  }
  return '';
}

export function elementByPositionWithElementInfo(
  elementsInfo: BaseElement[],
  position: {
    x: number;
    y: number;
  },
  size: { width: number; height: number },
) {
  assert(typeof position !== 'undefined', 'position is required for query');
  console.log('positionN', { position, size });
  const screenWidth = size.width;
  const screenHeight = size.height;
  const positionN = {
    x: Number(((position.x / 1000) * screenWidth).toFixed(3)),
    y: Number(((position.y / 1000) * screenHeight).toFixed(3)),
  };
  const item = elementsInfo.find((item) => {
    return (
      item.rect.left <= positionN.x &&
      positionN.x <= item.rect.left + item.rect.width &&
      item.rect.top <= positionN.y &&
      positionN.y <= item.rect.top + item.rect.height
    );
  });
  return item;
}

export const samplePageDescription = `
The size of the page: 1280 x 720
Some of the elements are marked with a rectangle in the screenshot, some are not.

JSON description of all the elements in screenshot:
id=c81c4e9a33: {
  "markerId": 2, // The number indicated by the rectangle label in the screenshot
  "attributes":  // Attributes of the element
    {"data-id":"@submit s0","class":".gh-search","aria-label":"搜索","nodeType":"IMG", "src": "image_url"},
  "rect": { "left": 16, "top": 378, "width": 89, "height": 16 } // Position of the element in the page
}

id=5a29bf6419bd: {
  "content": "获取优惠券",
  "attributes": { "nodeType": "TEXT" },
  "rect": { "left": 32, "top": 332, "width": 70, "height": 18 }
}

...many more`;

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
  console.log('width', width);
  console.log('height', height);

  const elementsInfo = context.content;
  const idElementMap: Record<string, ElementType> = {};
  elementsInfo.forEach((item) => {
    idElementMap[item.id] = item;
    // accept indexId/markerId as a backup
    if ((item as any).indexId) {
      idElementMap[(item as any).indexId] = item;
    }
    return { ...item };
  });

  const elementInfosDescription = cropFieldInformation(
    elementsInfo,
    opt?.truncateTextLength,
    opt?.filterNonTextContent,
  );

  const contentList = elementInfosDescription
    .map((item) => {
      const { id, ...rest } = item;
      return `id=${id}: ${JSON.stringify(rest)}`;
    })
    .join('\n\n');

  return {
    description: `
The size of the page: ${describeSize({ width, height })}
Some of the elements are marked with a rectangle in the screenshot, some are not.

${
  // if match by id, use the description of the element
  getAIConfig(MATCH_BY_POSITION)
    ? ''
    : `Json description of all the page elements:\n${contentList}`
}
`,
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
      return elementByPositionWithElementInfo(elementsInfo, position, size);
    },
    size: { width, height },
  };
}

function cropFieldInformation(
  elementsInfo: BaseElement[],
  truncateTextLength?: number,
  filterNonTextContent = false,
) {
  const elementInfosDescription: Array<Record<string, any>> = elementsInfo.map(
    (item) => {
      const { id, attributes = {}, rect, content } = item;
      let htmlTagName = '';
      const tailorContent = truncateText(content, truncateTextLength);
      const tailorAttributes = Object.keys(attributes).reduce(
        (res, currentKey: string) => {
          const attributeVal = (attributes as any)[currentKey];
          if (currentKey === 'style' || currentKey === 'src') return res;
          if (currentKey === 'nodeType') {
            // when filterNonTextContent is true, we don't need to keep the nodeType since they are all TEXT
            if (!filterNonTextContent) {
              res[currentKey] = attributeVal.replace(/\sNode$/, '');
            }
          } else if (currentKey === 'htmlTagName') {
            if (!['<span>', '<p>', '<div>'].includes(attributeVal)) {
              htmlTagName = attributeVal;
            }
          } else {
            res[currentKey] = truncateText(attributeVal);
          }
          return res;
        },
        {} as BaseElement['attributes'],
      );

      return {
        id,
        ...(filterNonTextContent || tailorContent
          ? {}
          : { markerId: (item as any).indexId }),
        ...(tailorContent ? { content: tailorContent } : {}),
        ...(Object.keys(tailorAttributes).length && !tailorContent
          ? { attributes: tailorAttributes }
          : {}),
        ...(htmlTagName ? { htmlTagName } : {}),
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          // remove 'zoom' if it exists
        },
      };
    },
  );

  if (filterNonTextContent) {
    return elementInfosDescription.filter((item) => item.content);
  }
  return elementInfosDescription;
}

/**
 * elements
 */
export function retrieveElement(
  prompt: string,
  opt?: { multi: boolean },
): string {
  if (opt?.multi) {
    return `follow ${ELEMENTS_LOCATOR_PREFIX}: ${prompt}`;
  }
  return `follow ${ONE_ELEMENT_LOCATOR_PREFIX}: ${prompt}`;
}

export function ifElementTypeResponse(response: string): boolean {
  if (typeof response !== 'string') {
    return false;
  }
  return (
    response.startsWith(ONE_ELEMENT_LOCATOR_PREFIX) ||
    response.startsWith(ELEMENTS_LOCATOR_PREFIX)
  );
}

export function splitElementResponse(
  response: string,
): string | null | string[] {
  const oneElementSplitter = `${ONE_ELEMENT_LOCATOR_PREFIX}/`;
  if (response.startsWith(oneElementSplitter)) {
    const id = response.slice(oneElementSplitter.length);
    if (id.indexOf(',') >= 0) {
      console.warn(`unexpected comma in one element response: ${id}`);
    }
    return id ? id : null;
  }

  const elementsSplitter = `${ELEMENTS_LOCATOR_PREFIX}/`;
  if (response.startsWith(elementsSplitter)) {
    const idsString = response.slice(elementsSplitter.length);
    if (!idsString) {
      return [];
    }
    return idsString.split(',');
  }

  return null;
}

/**
 * sections
 */

export function retrieveSection(prompt: string): string {
  return `${SECTION_MATCHER_FLAG}${prompt}`;
}
