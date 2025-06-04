import { getPreferredLanguage } from '@midscene/shared/env';
import type { ResponseFormatJSONSchema } from 'openai/resources';

const defaultAssertionPrompt =
  'You are a senior testing engineer. User will give an assertion and a screenshot of a page. By carefully viewing the screenshot, please tell whether the assertion is truthy.';

const getDefaultAssertionResponseJsonFormat = (
  deepThink: boolean,
) => `Return in the following JSON format:
${
  deepThink
    ? `{
  thought: string, // string, ALWAYS provide the reasoning process that led to the pass/fail conclusion. This should detail the step-by-step thinking.
  pass: boolean, // whether the assertion is truthy
}`
    : `{
  pass: boolean, // whether the assertion is truthy
  thought: string, // string, if the result is falsy, give the reason why it is falsy. Otherwise, put null.
  }`
}
`;

const getUiTarsAssertionResponseJsonFormat = (
  deepThink: boolean,
) => `## Output Json String Format
\`\`\`
${
  deepThink
    ? `{
  "thought": "<<is a string, ALWAYS provide the reasoning process that led to the pass/fail conclusion. This should detail the step-by-step thinking.>>", 
  "pass": <<is a boolean value from the enum [true, false], true means the assertion is truthy>>, 
}`
    : `{
  "pass": <<is a boolean value from the enum [true, false], true means the assertion is truthy>>, 
  "thought": "<<is a string, give the reason why the assertion is falsy or truthy. Otherwise.>>"

}`
}
\`\`\`

## Rules **MUST** follow
- Make sure to return **only** the JSON, with **no additional** text or explanations.
- Use ${getPreferredLanguage()} in \`thought\` part.
- You **MUST** strictly follow up the **Output Json String Format**.`;

export function systemPromptToAssert(model: {
  isUITars: boolean;
  deepThink: boolean;
}) {
  return `${defaultAssertionPrompt}

${model.isUITars ? getUiTarsAssertionResponseJsonFormat(model.deepThink) : getDefaultAssertionResponseJsonFormat(model.deepThink)}`;
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
