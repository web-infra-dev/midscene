import type { ResponseFormatJSONSchema } from 'openai/resources/index';

export const assertSchema: ResponseFormatJSONSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'assert',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        pass: {
          type: 'boolean',
          description: 'Whether the assertion passed or failed',
        },
        thought: {
          type: ['string', 'null'],
          description: 'The thought process behind the assertion',
        },
      },
      required: ['pass', 'thought'],
      additionalProperties: false,
    },
  },
};
