import { PromptTemplate } from '@langchain/core/prompts';
import type { TVlModeTypes } from '@midscene/shared/env';
import { bboxDescription } from './common';
export function systemPromptToLocateElement(vlMode: TVlModeTypes | undefined) {
  const bboxComment = bboxDescription(vlMode);
  return `
## Role:
You are an expert in software testing.

## Objective:
- Identify elements in screenshots and text that match the user's description.
- Give the coordinates of the element that matches the user's description best in the screenshot.
- Determine whether the user's description is order-sensitive (e.g., contains phrases like 'the third item in the list', 'the last button', etc.).

## Output Format:
\`\`\`json
{
  "bbox": [number, number, number, number],  // ${bboxComment}
  "errors"?: string[],
  "isOrderSensitive": boolean // Whether the targetElementDescription is order-sensitive (true/false)
}
\`\`\`

Fields:
* \`bbox\` is the bounding box of the element that matches the user's description best in the screenshot
* \`isOrderSensitive\` is a boolean indicating whether the user's description is order-sensitive (true/false)
* \`errors\` is an optional array of error messages (if any)

Order-sensitive means the description contains phrases like:
- "the third item in the list"
- "the last button"
- "the first input box"
- "the second row"

Not order-sensitive means the description is like:
- "confirm button"
- "search box"
- "password input"

For example, when an element is found and the description is order-sensitive:
\`\`\`json
{
  "bbox": [100, 100, 200, 200],
  "isOrderSensitive": true,
  "errors": []
}
\`\`\`

When no element is found and the description is not order-sensitive:
\`\`\`json
{
  "bbox": [],
  "isOrderSensitive": false,
  "errors": ["I can see ..., but {some element} is not found"]
}
\`\`\`
`;
}

export const findElementPrompt = new PromptTemplate({
  template: `
Here is the item user want to find:
=====================================
{targetElementDescription}
=====================================

{pageDescription}
  `,
  inputVariables: ['pageDescription', 'targetElementDescription'],
});
