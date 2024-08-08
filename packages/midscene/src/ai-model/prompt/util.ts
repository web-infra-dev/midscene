import assert from 'node:assert';
import { imageInfoOfBase64 } from '@/image';
import type {
  BaseElement,
  BasicSectionQuery,
  Size,
  UIContext,
  UISection,
} from '@/types';

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

const skillSegment = `skill name: segment_a_web_page 
skill content:
Based on the functions and content of various elements on the page, segment the screenshot into different sections like navigation bar, product list, news area, etc. 
Some general rules for segmentation:
* Each section should NOT overlap with each other.
* Each text should only belong to one section.
* [IMPORTANT] Whether the content visually appears to belong to different sections is a significant factor in segmenting the page.
* Analyze the page in a top-to-bottom and left-to-right order.
* The evidence indicates a separate section, for example 
  - The background color of certain parts of the page changes.
  - A section of a page includes a title.
* Provide the following data for each of the UI section you found.
  {
    "name": "name of the section",
    "description": "briefly summarize the key content or usage of this section.",
    "sectionCharacteristics": "In view of the need to distinguish this section from the surrounding sections, explain the characteristics and how to define boundaries and what precautions to take.",
    "textIds": ["5", "6", "7"], // ids of all text elements in this section
  }
`;

const skillExtractData = `skill name: extract_data_from_UI
related input: DATA_DEMAND
skill content: 
* User will give you some data requirements in DATA_DEMAND. Consider the UI context, follow the user's instructions, and provide comprehensive data accordingly.
* There may be some special commands in DATA_DEMAND, please pay extra attention
  - ${ONE_ELEMENT_LOCATOR_PREFIX} and ${ELEMENTS_LOCATOR_PREFIX}: if you see a description that mentions the keyword ${ONE_ELEMENT_LOCATOR_PREFIX} or ${ELEMENTS_LOCATOR_PREFIX}(e.g. follow ${ONE_ELEMENT_LOCATOR_PREFIX} : i want to find ...), it means user wants to locate a specific element meets the description. Return in this way: prefix + the id / comma-separated ids, for example: ${ONE_ELEMENT_LOCATOR_PREFIX}/1 , ${ELEMENTS_LOCATOR_PREFIX}/1,2,3 . If not found, keep the prefix and leave the suffix empty, like ${ONE_ELEMENT_LOCATOR_PREFIX}/ .`;

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

export function systemPromptToExtract(
  dataQuery: Record<string, string> | string,
  sections?: BasicSectionQuery[],
) {
  const allSectionNames: string[] =
    sections?.filter((c) => c.name).map((c) => c.name || '') || [];
  const sectionFindingPrompt = promptsOfSectionQuery(sections || []);
  const sectionReturnFormat = allSectionNames.length
    ? '  sections: [], // detailed information of each section from segment_a_web_page skill'
    : '';

  return `
${characteristic}
${contextFormatIntro}

You have the following skills:
${allSectionNames.length ? skillSegment : ''}
${skillExtractData}

Now, do the following jobs:
${sectionFindingPrompt}
Use your extract_data_from_UI skill to find the following data, placing it in the \`data\` field
DATA_DEMAND start:
${
  typeof dataQuery === 'object'
    ? `return in key-value style object, keys are ${Object.keys(dataQuery).join(',')}`
    : ''
};
${typeof dataQuery === 'string' ? dataQuery : JSON.stringify(dataQuery, null, 2)}
DATA_DEMAND ends.

Return in the following JSON format:
{
  language: "en", // "en" or "zh", the language of the page. Use the same language to describe section name, description, and similar fields.
  ${sectionReturnFormat}
  data: any, // the extracted data from extract_data_from_UI skill. Make sure both the value and scheme meet the DATA_DEMAND.
  errors?: [], // string[], error message if any
}
`;
}

export function systemPromptToAssert() {
  return `
${characteristic}
${contextFormatIntro}

Based on the information you get, Return assertion judgment:

Return in the following JSON format:
{
  thought: string, // string, the thought of the assertion
  pass: true, // true or false, whether the assertion is passed
}
`;
}

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

export function describeSectionInputFormat() {
  return `
The sections are formatted in the following way:
  left, top, right, bottom, color-on-the-diagram, section-name
`;
}

export function describeSections(
  sections: UISection[],
  colorOfSectionName: (name: string) => string,
) {
  return sections
    .map((item) =>
      [
        item.rect.left,
        item.rect.top,
        item.rect.left + item.rect.width,
        item.rect.top + item.rect.height,
        colorOfSectionName(item.name),
        item.name,
      ].join(', '),
    )
    .join('\n');
}

export function truncateText(text: string) {
  const maxLength = 50;
  if (text && text.length > maxLength) {
    return `${text.slice(0, maxLength)}...`;
  }
  return text;
}

export async function describeUserPage<
  ElementType extends BaseElement = BaseElement,
>(context: Omit<UIContext<ElementType>, 'describer'>) {
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

  const elementInfosDescription = cropfieldInformation(elementsInfo);

  return {
    description: `
    {
      // The size of the page
      "pageSize": ${describeSize({ width, height })},\n
      
      // json description of the element
      "elementInfos": ${JSON.stringify(elementInfosDescription)}
    }`,
    elementById(id: string) {
      assert(typeof id !== 'undefined', 'id is required for query');
      const item = idElementMap[`${id}`];
      return item;
    },
  };
}

function cropfieldInformation(elementsInfo: BaseElement[]) {
  const elementInfosDescription: Array<PromptElementType> = elementsInfo.map(
    (item) => {
      const { id, attributes = {}, rect, content } = item;
      const tailorContent = truncateText(content);
      const tailorAttributes = Object.keys(attributes).reduce(
        (res, currentKey: string) => {
          const attributeVal = (attributes as any)[currentKey];
          res[currentKey] = truncateText(attributeVal);
          return res;
        },
        {} as BaseElement['attributes'],
      );

      return {
        id,
        attributes: tailorAttributes,
        rect,
        content: tailorContent,
      };
    },
  );
  return JSON.stringify(elementInfosDescription);
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
