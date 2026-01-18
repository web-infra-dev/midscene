import type { TModelFamily } from '@midscene/shared/env';
import { bboxDescription } from './common';

export function systemPromptToLocateMultiElements(
  vlMode: TModelFamily | undefined,
) {
  const bboxComment = bboxDescription(vlMode);
  return `
## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
- I will give you a list of element descriptions.
- You need to help identify the bounding box of each element in the screenshot.
- Return the result in the order of the descriptions.

## Output Format:
\`\`\`json
{
  "elements": [
    {
      "bbox": [number, number, number, number] // ${bboxComment}
    }
  ],
  "errors"?: string[]
}
\`\`\`

Fields:
* \`elements\`: an array of objects, each containing the bounding box of the element that matches the description. The order must match the input descriptions.
* \`bbox\` is the bounding box of the element. If not found, use [].
* \`errors\` is an optional array of error messages (if any)

For example,
Input:
["the search box", "the login button"]

Output:
\`\`\`json
{
  "elements": [
    {
      "bbox": [100, 100, 200, 200], // for search box
    },
    {
      "bbox": [300, 300, 400, 400], // for login button
    }
  ],
  "errors": []
}
\`\`\`
`;
}

export const findMultiElementsPrompt = (descriptions: string[]) => {
  return `Find these elements:\n${descriptions
    .map((desc, index) => `${index + 1}. ${desc}`)
    .join('\n')}`;
};
