import type { TModelFamily } from '@midscene/shared/env';
import { getPreferredLanguage } from '@midscene/shared/env';
import { bboxDescription } from './common';

export function systemPromptToLocateElement(
  modelFamily: TModelFamily | undefined,
  options?: { isArray?: boolean },
) {
  const preferredLanguage = getPreferredLanguage();
  const bboxComment = bboxDescription(modelFamily);
  const isArray = options?.isArray ?? false;

  if (isArray) {
    return `
## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
- Identify MULTIPLE elements in screenshots that match the user's descriptions.
- Each element description is indexed with a number (starting from 0).
- Provide the coordinates of each element that matches its description.
- Return results for ALL requested elements, maintaining the same indexId.

## Output Format:
\`\`\`json
{
  "elements": [
    {
      "indexId": number,  // The index of the element description (0-based)
      "bbox": [number, number, number, number],  // ${bboxComment}
      "errors"?: string[]
    },
    ...
  ],
  "errors"?: string[]
}
\`\`\`

Fields:
* \`elements\` is an array of found elements, each with:
  * \`indexId\` - the index matching the element description in the request
  * \`bbox\` - the bounding box of the element (empty array if not found)
  * \`errors\` - optional error messages for this specific element
* \`errors\` - optional global error messages

For example, when elements are found:
\`\`\`json
{
  "elements": [
    {"indexId": 0, "bbox": [100, 100, 200, 200]},
    {"indexId": 1, "bbox": [300, 150, 400, 250]},
    {"indexId": 2, "bbox": [], "errors": ["Element not found"]}
  ]
}
\`\`\`

IMPORTANT:
- You MUST return a result for EVERY element in the request, even if not found.
- Use empty bbox [] and add error message when an element cannot be found.
- Keep the indexId matching the order of descriptions in the request.
- Use ${preferredLanguage} for error messages.
`;
  }

  return `
## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
- Identify elements in screenshots that match the user's description.
- Provide the coordinates of the element that matches the user's description.

## Output Format:
\`\`\`json
{
  "bbox": [number, number, number, number],  // ${bboxComment}
  "errors"?: string[]
}
\`\`\`

Fields:
* \`bbox\` is the bounding box of the element that matches the user's description
* \`errors\` is an optional array of error messages (if any)

For example, when an element is found:
\`\`\`json
{
  "bbox": [100, 100, 200, 200],
  "errors": []
}
\`\`\`

When no element is found:
\`\`\`json
{
  "bbox": [],
  "errors": ["I can see ..., but {some element} is not found. Use ${preferredLanguage}."]
}
\`\`\`
`;
}

export function findElementPrompt(
  targetElementDescription: string | string[],
): string {
  if (Array.isArray(targetElementDescription)) {
    const indexed = targetElementDescription
      .map((desc, index) => `${index}. ${desc}`)
      .join('\n');
    return `Find elements:\n${indexed}`;
  }
  return `Find: ${targetElementDescription}`;
}
