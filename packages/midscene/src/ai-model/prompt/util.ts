import assert from 'node:assert';
import { MATCH_BY_POSITION, getAIConfig } from '@/env';
import { imageInfoOfBase64 } from '@/image';
import type {
  BaseElement,
  BasicSectionQuery,
  Point,
  Size,
  UIContext,
  UISection,
} from '@/types';
import type { ResponseFormatJSONSchema } from 'openai/resources';

const characteristic =
  'You are a versatile professional in software UI design and testing. Your outstanding contributions will impact the user experience of billions of users.';

const contextFormatIntro = `
The user will give you a screenshot and the texts on it. There may be some none-English characters (like Chinese) on it, indicating it's an non-English app.`;

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

export function promptsOfSectionQuery(
  constraints: BasicSectionQuery[],
): string {
  if (!constraints.length) {
    return '';
  }
  const instruction =
    'Use your segment_a_web_page skill to find the following section(s)';
  const singleSection = (c: BasicSectionQuery) => {
    assert(
      c.name || c.description,
      'either `name` or `description` is required to define a section constraint',
    );

    const number = 'One section';
    const name = c.name ? `named \`${c.name}\`` : '';
    const description = c.description
      ? `, usage or criteria : ${c.description}`
      : '';
    const basic = `* ${number} ${name}${description}`;

    return basic;
  };
  return `${instruction}\n${constraints.map(singleSection).join('\n')}`;
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

/*
To modify the response format:
  1. update the function `describeSectionResponseFormat` here
  2. update `expandLiteSection` in insight/utils.ts
  3. update `UISection` and `LiteUISection` in types.ts
*/

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

export function truncateText(text: string, maxLength = 20) {
  if (text && text.length > maxLength) {
    return `${text.slice(0, maxLength)}...`;
  }

  if (typeof text === 'string') {
    return text.trim();
  }
  return '';
}

export function elementByPosition(
  elementsInfo: BaseElement[],
  position: {
    x: number;
    y: number;
  },
) {
  assert(typeof position !== 'undefined', 'position is required for query');
  const item = elementsInfo.find((item) => {
    return (
      item.rect.left <= position.x &&
      position.x <= item.rect.left + item.rect.width &&
      item.rect.top <= position.y &&
      position.y <= item.rect.top + item.rect.height
    );
  });
  return item;
}

export async function describeUserPage<
  ElementType extends BaseElement = BaseElement,
>(
  context: Omit<UIContext<ElementType>, 'describer'>,
  opt?: {
    truncateTextLength?: number;
    filterEmptyContent?: boolean;
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

  const elementsInfo = context.content;
  const idElementMap: Record<string, ElementType> = {};
  elementsInfo.forEach((item) => {
    idElementMap[item.id] = item;
    return { ...item };
  });

  const elementInfosDescription = cropFieldInformation(
    elementsInfo,
    opt?.truncateTextLength,
    opt?.filterEmptyContent,
  );

  return {
    description: `
{
  // The size of the page
  "pageSize": ${describeSize({ width, height })},\n
  ${
    // if match by id, use the description of the element
    getAIConfig(MATCH_BY_POSITION)
      ? ''
      : `// json description of the element
  "content": ${JSON.stringify(elementInfosDescription)}
      `
  }
}`,
    elementById(id: string) {
      assert(typeof id !== 'undefined', 'id is required for query');
      const item = idElementMap[`${id}`];
      return item;
    },
    elementByPosition(position: { x: number; y: number }) {
      return elementByPosition(elementsInfo, position);
    },
  };
}

function cropFieldInformation(
  elementsInfo: BaseElement[],
  truncateTextLength = 20,
  filterEmptyContent = false,
) {
  const elementInfosDescription: Array<Record<string, any>> = elementsInfo.map(
    (item) => {
      const { id, attributes = {}, rect, content } = item;
      const tailorContent = truncateText(content, truncateTextLength);
      const tailorAttributes = Object.keys(attributes).reduce(
        (res, currentKey: string) => {
          const attributeVal = (attributes as any)[currentKey];
          if (currentKey === 'style' || currentKey === 'src') return res;
          if (currentKey === 'nodeType') {
            // when filterEmptyContent is true, we don't need to keep the nodeType since they are all TEXT
            if (!filterEmptyContent) {
              res[currentKey] = attributeVal.replace(/\sNode$/, '');
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
        ...(filterEmptyContent ? {} : { markerId: (item as any).indexId }),
        ...(Object.keys(tailorAttributes).length
          ? { attributes: tailorAttributes }
          : {}),
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          // remove 'zoom' if it exists
        },
        ...(tailorContent ? { content: tailorContent } : {}),
      };
    },
  );

  if (filterEmptyContent) {
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

export function extractSectionQuery(input: string): string | false {
  if (typeof input === 'string' && input.startsWith(SECTION_MATCHER_FLAG)) {
    return input.slice(SECTION_MATCHER_FLAG.length);
  }
  return false;
}
