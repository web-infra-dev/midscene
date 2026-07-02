import type { LocateResultPromptSpec } from '../shared/model-locate-result';
import { locateGroundingRules } from './locate-grounding-rules';
import { formatLocateExampleValue } from './locate-param-example';

export function systemPromptToLocateAllElements(
  promptSpec: LocateResultPromptSpec,
) {
  const resultKey = promptSpec.resultKey;
  const exampleValues = promptSpec.exampleValues
    .slice(0, 2)
    .map((value) => formatLocateExampleValue(value));
  const firstExample = exampleValues[0];
  const secondExample = exampleValues[1] ?? exampleValues[0];
  const resultFieldDescription = `the ${promptSpec.resultNoun} of one element that matches the user's description`;

  return `
## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
- Identify ALL elements in screenshots that match the user's description.
- Return every visible matching element.
- Do not return elements that only partially match the description.

${locateGroundingRules()}

## Output Format:
\`\`\`json
{
  "elements": [
    {
      "${resultKey}": ${promptSpec.resultValueSchema}  // ${promptSpec.resultValueDescription}
    }
  ],
  "errors"?: string[]
}
\`\`\`

Fields:
* \`elements\` is an array of matching elements.
* \`${resultKey}\` is ${resultFieldDescription}.
* \`errors\` is an optional array of error messages (if any).

Sorting:
* Order elements from top-to-bottom, then left-to-right for stable output.

For example, when elements are found:
\`\`\`json
{
  "elements": [
    { "${resultKey}": ${firstExample} },
    { "${resultKey}": ${secondExample} }
  ],
  "errors": []
}
\`\`\`

When no element is found:
\`\`\`json
{
  "elements": [],
  "errors": []
}
\`\`\`
`;
}

export const findAllElementsPrompt = (targetElementDescription: string) =>
  `Find ALL elements that match: ${targetElementDescription}`;
