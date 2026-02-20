import type { TModelFamily } from '@midscene/shared/env';
import { getPreferredLanguage } from '@midscene/shared/env';
import { bboxDescription } from './common';

export function systemPromptToLocateElements(
  modelFamily: TModelFamily | undefined,
) {
  const preferredLanguage = getPreferredLanguage();
  const bboxComment = bboxDescription(modelFamily);
  return `
## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
- Identify multiple elements in screenshots that match the user's descriptions.
- Provide the coordinates of each element that matches the corresponding description.
- Return results in the same order as the input descriptions.

## Output Format:
\`\`\`json
{
  "elements": [
    {
      "id": string,  // The ID from the input
      "bbox": [number, number, number, number],  // ${bboxComment}
      "error"?: string  // Error message if element not found
    }
  ]
}
\`\`\`

Fields:
* \`elements\` is an array of results, one for each input description, in the same order
* \`id\` is the identifier from the input, used to match results with requests
* \`bbox\` is the bounding box of the element that matches the description
* \`error\` is an optional error message when the element cannot be found

For example, when all elements are found:
\`\`\`json
{
  "elements": [
    { "id": "0", "bbox": [100, 100, 200, 200] },
    { "id": "1", "bbox": [300, 300, 400, 400] }
  ]
}
\`\`\`

When some elements are not found:
\`\`\`json
{
  "elements": [
    { "id": "0", "bbox": [100, 100, 200, 200] },
    { "id": "1", "bbox": [], "error": "Element not found. Use ${preferredLanguage}." }
  ]
}
\`\`\`
`;
}

export interface BatchLocateTarget {
  id: string;
  description: string;
}

export const findElementsPrompt = (targets: BatchLocateTarget[]) => {
  const targetList = targets
    .map((t) => `- ID "${t.id}": ${t.description}`)
    .join('\n');
  return `Find the following elements:\n${targetList}`;
};
