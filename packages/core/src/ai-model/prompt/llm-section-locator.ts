import { getPreferredLanguage } from '@midscene/shared/env';
import type { LocateResultPromptSpec } from '../shared/model-locate-result';
import { formatLocateExampleValue } from './locate-param-example';

export function systemPromptToLocateSection(
  promptSpec: LocateResultPromptSpec,
) {
  const preferredLanguage = getPreferredLanguage();
  const resultKey = promptSpec.resultKey;
  const exampleValueText = formatLocateExampleValue(
    promptSpec.exampleValues[0],
  );
  const resultJsonProperty = `"${resultKey}": ${promptSpec.resultValueSchema},  // ${promptSpec.resultValueDescription}`;
  const resultValueType = promptSpec.resultValueSchema;
  const resultFieldDescription = `${promptSpec.resultNoun} of the section containing the target element`;
  const referenceFieldDescription = `Optional array of ${promptSpec.resultNounPlural} of reference elements`;
  return `
## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
- Find a section containing the target element
- If the description mentions reference elements, also locate sections containing those references

## Output Format:
\`\`\`json
{
  ${resultJsonProperty}
  "references_${resultKey}"?: [
    ${resultValueType},
    ...
  ],
  "error"?: string
}
\`\`\`

Fields:
* \`${resultKey}\` - ${resultFieldDescription}
* \`references_${resultKey}\` - ${referenceFieldDescription}
* \`error\` - Optional error message if the section cannot be found. Use ${preferredLanguage}.

Example:
If the description is "delete button on the second row with title 'Peter'", return:
\`\`\`json
{
  "${resultKey}": ${exampleValueText},
  "references_${resultKey}": [${exampleValueText}]
}
\`\`\`
`;
}

export const sectionLocatorInstruction = (sectionDescription: string) =>
  `Find section containing: ${sectionDescription}`;
