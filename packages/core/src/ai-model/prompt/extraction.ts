import type { AIDataExtractionResponse } from '@/types';
import { getPreferredLanguage } from '@midscene/shared/env';
import type { ResponseFormatJSONSchema } from 'openai/resources/index';
import { safeParseJson } from '../service-caller/index';
import { extractXMLTag } from './util';

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

export function systemPromptToExtract() {
  const preferredLanguage = getPreferredLanguage();

  return `
You are a versatile professional in software UI design and testing. Your outstanding contributions will impact the user experience of billions of users.

The user will give you a screenshot, the contents of it (optional), and some data requirements in <DATA_DEMAND>. You need to understand the user's requirements and extract the data satisfying the <DATA_DEMAND>.

If a key specifies a JSON data type (such as Number, String, Boolean, Object, Array), ensure the returned value strictly matches that data type.

If the user provides multiple reference images, please carefully review the reference images with the screenshot and provide the correct answer for <DATA_DEMAND>.


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
  "result": "Boolean, is it currently the SMS page?"
}
</DATA_DEMAND>

By viewing the screenshot and page contents, you can extract the following data:

<thought>According to the screenshot, i can see ...</thought>
<data-json>
{ "result": true }
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
          description: 'The extracted data',
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
