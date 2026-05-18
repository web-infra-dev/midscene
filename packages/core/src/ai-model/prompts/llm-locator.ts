import { getStandardLocateResultAdapter } from '@/ai-model/models';
import type { TModelFamily } from '@midscene/shared/env';
import { getPreferredLanguage } from '@midscene/shared/env';
import {
  describeLocateResultField,
  describeLocateResultJsonProperty,
  locateResultExampleJsonEntry,
} from './locate-result-format';

export function systemPromptToLocateElement(
  modelFamily: TModelFamily | undefined,
) {
  const preferredLanguage = getPreferredLanguage();
  const responseFormat =
    getStandardLocateResultAdapter(modelFamily).responseFormat;
  const resultJsonProperty = describeLocateResultJsonProperty(responseFormat);
  const resultKey = responseFormat.resultType;
  const resultFieldDescription = `the ${describeLocateResultField(
    responseFormat,
    "the element that matches the user's description",
  )}`;
  return `
## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
- Identify elements in screenshots that match the user's description.
- Provide the coordinates of the element that matches the user's description.

## Important Notes for Locating Elements:
- When the user describes an element that contains text (such as buttons, input fields, dropdown options, radio buttons, etc.), you should locate ONLY the text region of that element, not the entire element boundary.
- For example: If an input field is large (both wide and tall) with a placeholder text "Please enter your comment", you should locate only the area where the placeholder text appears, not the entire input field.
- This principle applies to all text-containing elements: focus on the visible text region rather than the full element container.

## Output Format:
\`\`\`json
{
  ${resultJsonProperty}
  "errors"?: string[]
}
\`\`\`

Fields:
* \`${resultKey}\` is ${resultFieldDescription}
* \`errors\` is an optional array of error messages (if any)

For example, when an element is found:
\`\`\`json
{
  ${locateResultExampleJsonEntry(responseFormat)},
  "errors": []
}
\`\`\`

When no element is found:
\`\`\`json
{
  "${resultKey}": [],
  "errors": ["I can see ..., but {some element} is not found. Use ${preferredLanguage}."]
}
\`\`\`
`;
}

export const findElementPrompt = (targetElementDescription: string) =>
  `Find: ${targetElementDescription}`;
