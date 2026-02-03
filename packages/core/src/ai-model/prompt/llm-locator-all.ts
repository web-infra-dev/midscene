import type { TModelFamily } from '@midscene/shared/env';
import { bboxDescription } from './common';

export function systemPromptToLocateAllElements(
  vlMode: TModelFamily | undefined,
) {
  const bboxComment = bboxDescription(vlMode);
  return `
## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
- I will give you ONE element description.
- You need to find ALL matching elements in the screenshot.
- Return every match you can see.

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
* \`elements\`: an array of objects, each containing the bounding box of a matching element.
* \`bbox\` is the bounding box of the element. If no elements are found, return an empty array.
* \`errors\` is an optional array of error messages (if any).

Sorting:
* Order elements from top-to-bottom, then left-to-right for stability.

For example,
Input:
"the follow button"

Output:
\`\`\`json
{
  "elements": [
    { "bbox": [100, 100, 200, 200] },
    { "bbox": [300, 100, 400, 200] }
  ],
  "errors": []
}
\`\`\`
`;
}

export const findAllElementsPrompt = (description: string) => {
  return `Find ALL elements that match: ${description}`;
};
