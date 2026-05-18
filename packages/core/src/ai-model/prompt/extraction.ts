import type { AIDataExtractionResponse, ServiceExtractParam } from '@/types';
import { getPreferredLanguage } from '@midscene/shared/env';
import { safeParseJson } from '../service-caller/index';
import { extractXMLTag } from './util';

export function buildTypeQueryDemandValue(
  type: 'Boolean' | 'Number' | 'String' | 'Assert' | 'WaitFor',
  demand: ServiceExtractParam,
) {
  const currentScreenshotConstraint =
    'based on the current screenshot and its contents if provided, unless the user explicitly asks to compare with reference images';

  if (type === 'Assert') {
    return `Boolean, ${currentScreenshotConstraint}, whether the following statement is true: ${demand}`;
  }

  if (type === 'WaitFor') {
    return `Boolean, the user wants to do some 'wait for' operation. ${currentScreenshotConstraint}, please check whether the following statement is true: ${demand}`;
  }

  return `${type}, ${currentScreenshotConstraint}, ${demand}`;
}

/**
 * Parse XML response from LLM and convert to AIDataExtractionResponse
 */
export function parseXMLExtractionResponse<T>(
  xmlString: string,
): AIDataExtractionResponse<T> {
  const thought = extractXMLTag(xmlString, 'thought');
  const dataJsonStr = extractXMLTag(xmlString, 'data-json');
  const errorsStr = extractXMLTag(xmlString, 'errors');

  // Parse data-json (required)
  if (!dataJsonStr) {
    throw new Error('Missing required field: data-json');
  }

  let data: T;
  try {
    data = safeParseJson(dataJsonStr, undefined) as T;
  } catch (e) {
    throw new Error(`Failed to parse data-json: ${e}`);
  }

  // Parse errors (optional)
  let errors: string[] | undefined;
  if (errorsStr) {
    try {
      const parsedErrors = safeParseJson(errorsStr, undefined);
      if (Array.isArray(parsedErrors)) {
        errors = parsedErrors;
      }
    } catch (e) {
      // If errors parsing fails, just ignore it
    }
  }

  return {
    ...(thought ? { thought } : {}),
    data,
    ...(errors && errors.length > 0 ? { errors } : {}),
  };
}

export function systemPromptToExtract(options?: {
  screenshotIncluded?: boolean;
  referenceImagesIncluded?: boolean;
}) {
  const preferredLanguage = getPreferredLanguage();
  const screenshotIncluded = options?.screenshotIncluded ?? true;
  const referenceImagesIncluded = options?.referenceImagesIncluded ?? false;

  const contextPrompts = [
    "The user will give you data requirements in <DATA_DEMAND>. You need to understand the user's requirements and extract the data satisfying the <DATA_DEMAND>.",
  ];

  if (screenshotIncluded) {
    contextPrompts.push(
      'The user will provide a current screenshot to evaluate, and may provide its contents. Base your answer on the current screenshot and its contents when provided. Treat them as the primary source of truth for what is currently visible or true.',
    );
  } else {
    contextPrompts.push(
      'The user will not provide a current screenshot. Use only the supplied page contents and other inputs, and do not infer unsupported visual details.',
    );
  }

  if (referenceImagesIncluded) {
    const referenceImagesPrompt =
      'Reference images are supporting context only unless <DATA_DEMAND> explicitly asks for comparison, matching, or reasoning about them.';
    contextPrompts.push(
      screenshotIncluded
        ? `${referenceImagesPrompt} Do not conclude that something exists in the current screenshot solely because it appears in a reference image; when they conflict, trust the current screenshot and its contents.`
        : `${referenceImagesPrompt} Do not treat reference images as direct evidence of the current state unless the demand explicitly asks you to use them that way.`,
    );
  }
  const contextPrompt = contextPrompts.join('\n\n');

  return `
You are a versatile professional in software UI design and testing. Your outstanding contributions will impact the user experience of billions of users.

${contextPrompt}

If a key specifies a JSON data type (such as Number, String, Boolean, Object, Array), ensure the returned value strictly matches that data type.

When DATA_DEMAND is a JSON object, the keys in your response must exactly match the keys in DATA_DEMAND. Do not rename, translate, or substitute any key.


Return in the following XML format:
<thought>the thinking process of the extraction, less than 300 words. Use ${preferredLanguage} in this field.</thought>
<data-json>the extracted data as JSON. Make sure both the value and scheme meet the DATA_DEMAND. If you want to write some description in this field, use the same language as the DATA_DEMAND.</data-json>
<errors>optional error messages as JSON array, e.g., ["error1", "error2"]</errors>

# Example 1
For example, if the DATA_DEMAND is:

<DATA_DEMAND>
{
  "name": "name shows on the left panel, string",
  "age": "age shows on the right panel, number",
  "isAdmin": "if the user is admin, boolean"
}
</DATA_DEMAND>

By viewing the screenshot and page contents, you can extract the following data:

<thought>According to the screenshot, i can see ...</thought>
<data-json>
{
  "name": "John",
  "age": 30,
  "isAdmin": true
}
</data-json>

# Example 2
If the DATA_DEMAND is:

<DATA_DEMAND>
the todo items list, string[]
</DATA_DEMAND>

By viewing the screenshot and page contents, you can extract the following data:

<thought>According to the screenshot, i can see ...</thought>
<data-json>
["todo 1", "todo 2", "todo 3"]
</data-json>

# Example 3
If the DATA_DEMAND is:

<DATA_DEMAND>
the page title, string
</DATA_DEMAND>

By viewing the screenshot and page contents, you can extract the following data:

<thought>According to the screenshot, i can see ...</thought>
<data-json>
"todo list"
</data-json>

# Example 4
If the DATA_DEMAND is:

<DATA_DEMAND>
{
  "StatementIsTruthy": "Boolean, is it currently the SMS page?"
}
</DATA_DEMAND>

By viewing the screenshot and page contents, you can extract the following data:

<thought>According to the screenshot, i can see ...</thought>
<data-json>
{ "StatementIsTruthy": true }
</data-json>
`;
}

export const extractDataQueryPrompt = (
  pageDescription: string,
  dataQuery: string | Record<string, string>,
) => {
  let dataQueryText = '';
  if (typeof dataQuery === 'string') {
    dataQueryText = dataQuery;
  } else {
    dataQueryText = JSON.stringify(dataQuery, null, 2);
  }

  return `
<PageDescription>
${pageDescription}
</PageDescription>

<DATA_DEMAND>
${dataQueryText}
</DATA_DEMAND>
  `;
};
