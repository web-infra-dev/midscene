import type { ResponseFormatJSONSchema } from 'openai/resources';
import { getTimeZoneInfo } from './ui-tars-planning';

export const language = getTimeZoneInfo().isChina ? 'Chinese' : 'English';
const defaultAssertionPrompt =
  'You are a senior testing engineer. User will give an assertion and a screenshot of a page. By carefully viewing the screenshot, please tell whether the assertion is truthy.';

const defaultAssertionResponseJsonFormat = `Return in the following JSON format:
{
  pass: boolean, // whether the assertion is truthy
  thought: string | null, // string, if the result is falsy, give the reason why it is falsy. Otherwise, put null.
}`;

const uiTarsAssertionResponseJsonFormat = `## Output Json String Format
\`\`\`
"{
  "pass": <<is a boolean value from the enum [true, false], true means the assertion is truthy>>, 
  "thought": "<<is a string, give the reason why the assertion is falsy or truthy. Otherwise.>>"
}"
\`\`\`

## Rules **MUST** follow
- Make sure to return **only** the JSON, with **no additional** text or explanations.
- Use ${language} in \`thought\` part.
- You **MUST** strictly follow up the **Output Json String Format**.`;

export function systemPromptToAssert(model: { isUITars: boolean }) {
  return `${defaultAssertionPrompt}

${model.isUITars ? uiTarsAssertionResponseJsonFormat : defaultAssertionResponseJsonFormat}`;
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
