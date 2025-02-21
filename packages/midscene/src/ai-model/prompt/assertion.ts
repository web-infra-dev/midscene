import { MIDSCENE_USE_QWEN_VL, getAIConfigInBoolean } from '@/env';
import type { ResponseFormatJSONSchema } from 'openai/resources';

export function systemPromptToAssert() {
  return `
You are a senior testing engineer. User will give an assertion and a screenshot of a page. Please tell whether the assertion is truthy.

Return in the following JSON format:
{
  pass: boolean, // whether the assertion is truthy
  thought: string | null, // string, if the result is falsy, give the reason why it is falsy. Otherwise, put null.
}`;
}

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
