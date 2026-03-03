import type { TModelFamily } from '@midscene/shared/env';
import { bboxDescription } from './common';

export type LocateMode = 'all' | 'multi';

export function systemPromptToLocateElements(
  vlMode: TModelFamily | undefined,
  mode: LocateMode,
) {
  const bboxComment = bboxDescription(vlMode);

  const objective =
    mode === 'all'
      ? `- I will give you ONE element description.
- You need to find ALL matching elements in the screenshot.
- Return every match you can see.`
      : `- I will give you a list of element descriptions.
- You need to help identify the bounding box of each element in the screenshot.
- Return the result in the order of the descriptions.`;

  const fieldsDescription =
    mode === 'all'
      ? `* \`elements\`: an array of objects, each containing the bounding box of a matching element.
* \`bbox\` is the bounding box of the element. If no elements are found, return an empty array.`
      : `* \`elements\`: an array of objects, each containing the bounding box of the element that matches the description. The order must match the input descriptions.
* \`bbox\` is the bounding box of the element. If not found, use [].`;

  const sortingNote =
    mode === 'all'
      ? `
Sorting:
* Order elements from top-to-bottom, then left-to-right for stability.
`
      : '';

  const example =
    mode === 'all'
      ? `For example,
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
\`\`\``
      : `For example,
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
\`\`\``;

  return `
## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
${objective}

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
${fieldsDescription}
* \`errors\` is an optional array of error messages (if any).
${sortingNote}
${example}
`;
}

export function findElementsPrompt(
  descriptions: string | string[],
  mode: LocateMode,
): string {
  if (mode === 'all') {
    return `Find ALL elements that match: ${descriptions as string}`;
  }
  const descArray = descriptions as string[];
  return `Find these elements:\n${descArray
    .map((desc, index) => `${index + 1}. ${desc}`)
    .join('\n')}`;
}
