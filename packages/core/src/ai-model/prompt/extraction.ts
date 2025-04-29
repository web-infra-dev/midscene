import { PromptTemplate } from '@langchain/core/prompts';
import type { ResponseFormatJSONSchema } from 'openai/resources';

export function systemPromptToExtract() {
  return `
You are a versatile professional in software UI design and testing. Your outstanding contributions will impact the user experience of billions of users.

The user will give you a screenshot, the contents of it (optional), and some data requirements in DATA_DEMAND. You need to extract the data according to the DATA_DEMAND.

Return in the following JSON format:
{
  data: any, // the extracted data. Make sure both the value and scheme meet the DATA_DEMAND. If you want to write some description in this field, use the same language as the DATA_DEMAND.
  errors: [], // string[], error message if any
}
`;
}

export const extractDataPrompt = new PromptTemplate({
  template: `
pageDescription: {pageDescription}

Extract the following data and place it in the \`data\` field. If a key specifies a JSON data type (such as Number, String, Boolean, Object, Array), ensure the returned value strictly matches that data type.
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
