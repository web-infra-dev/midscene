import { PromptTemplate } from '@langchain/core/prompts';
import type { ResponseFormatJSONSchema } from 'openai/resources';

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
