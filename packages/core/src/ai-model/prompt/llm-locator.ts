import { getPreferredLanguage } from '@midscene/shared/env';
import {
  type LocateResultPromptSpec,
  formatLocateExampleValue,
} from '../shared/model-locate-result';
import { locateGroundingRules } from './locate-grounding-rules';

export function systemPromptToLocateElement(
  promptSpec: LocateResultPromptSpec,
) {
  const preferredLanguage = getPreferredLanguage();
  const resultKey = promptSpec.resultKey;
  const exampleValueText = formatLocateExampleValue(
    promptSpec.exampleValues[0],
  );
  const resultFieldDescription = `the ${promptSpec.resultNoun} of the element that matches the user's description`;
  return `
## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
- Identify elements in screenshots that match the user's description.
- Provide the coordinates of the element that matches the user's description.

${locateGroundingRules()}

## Output Format:
\`\`\`json
{
  "${resultKey}": ${promptSpec.resultValueSchema},  // ${promptSpec.resultValueDescription}
  "error"?: string
}
\`\`\`

Fields:
* \`${resultKey}\` is ${resultFieldDescription}
* \`error\` is an optional error message (if any)

For example, when an element is found:
\`\`\`json
{
  "${resultKey}": ${exampleValueText}
}
\`\`\`

When no element is found:
\`\`\`json
{
  "${resultKey}": [],
  "error": "I can see ..., but {some element} is not found. Use ${preferredLanguage}."
}
\`\`\`
`;
}

export const findElementPrompt = (targetElementDescription: string) =>
  `Find: ${targetElementDescription}`;
