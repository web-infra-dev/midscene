import { getStandardLocateResultAdapter } from '@/ai-model/models';
import type { TModelFamily } from '@midscene/shared/env';
import { getPreferredLanguage } from '@midscene/shared/env';
import {
  describeLocateResultField,
  describeLocateResultJsonProperty,
  describeLocateResultValueSchema,
  formatLocateResultValue,
  locateResultExampleJsonEntry,
  locateResultExampleValue,
} from './locate-result-format';

export function systemPromptToLocateSection(
  modelFamily: TModelFamily | undefined,
) {
  const preferredLanguage = getPreferredLanguage();
  const responseFormat =
    getStandardLocateResultAdapter(modelFamily).responseFormat;
  const resultJsonProperty = describeLocateResultJsonProperty(responseFormat);
  const resultKey = responseFormat.resultType;
  const resultValueType = describeLocateResultValueSchema(responseFormat);
  const resultFieldDescription = describeLocateResultField(
    responseFormat,
    'the section containing the target element',
  );
  const referenceFieldDescription = `Optional array of ${describeLocateResultField(
    responseFormat,
    'reference elements',
    { plural: true },
  )}`;
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
  ${locateResultExampleJsonEntry(responseFormat)},
  "references_${resultKey}": [${formatLocateResultValue(locateResultExampleValue(responseFormat))}]
}
\`\`\`
`;
}

export const sectionLocatorInstruction = (sectionDescription: string) =>
  `Find section containing: ${sectionDescription}`;
