import { getTimeZoneInfo } from './ui-tars-planning';

export const language = getTimeZoneInfo().isChina ? 'Chinese' : 'English';

/**
 * UI Tars model doesn't support response_format, this is a stable workaround to forcefully ask UI-Tars generate Json Markdown as reponse
 *
 * Tip: It requires to set Temporature to 0
 */
export function systemPromptToAssertForUITars() {
  return `
You are a senior testing engineer. User will give an assertion and a screenshot of a page. Please tell whether the assertion is truthy.

## Output Json String Format
\`\`\`
"{
  "pass": <<is a boolean value from the enum [true, false], true means the assertion is truthy>>, 
  "thought": "<<is a string, give the reason why the assertion is falsy or truthy. Otherwise.>>"
}"
\`\`\`

## Rules **MUST** follow
- Make sure to return **only** the JSON, with **no additional** text or explanations.
- Use ${language} in \`thought\` part.
- You **MUST** strictly follow up the **Output Json String Format**.
`;
}
