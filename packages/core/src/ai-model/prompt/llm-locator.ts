import type { TModelFamily } from '@midscene/shared/env';
import { getPreferredLanguage } from '@midscene/shared/env';
import { bboxDescription } from './common';
export function systemPromptToLocateElement(
  modelFamily: TModelFamily | undefined,
) {
  const preferredLanguage = getPreferredLanguage();
  const bboxComment = bboxDescription(modelFamily);
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

## When Reference Images Are Provided:
- The FIRST image in the conversation is always the MAIN screenshot — you must return the bounding box of the element found in this MAIN screenshot.
- Any images provided after the main screenshot are reference images (visual examples of the element to find).
- When the task mentions a reference image name (e.g., "参考图片1"), it refers to the provided reference image with that name — do NOT search for that name as text on the page.
- Use the reference image as a visual template and locate the element in the MAIN screenshot that visually resembles it.
- The returned bounding box coordinates must be from the MAIN screenshot, not from the reference image.

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

export const findElementPrompt = (
  targetElementDescription: string,
  referenceImageNames?: string[],
) => {
  if (referenceImageNames?.length) {
    const nameList = referenceImageNames.map((n) => `'${n}'`).join(', ');
    return `Find the element in the MAIN screenshot (first image) that visually matches the reference image${referenceImageNames.length > 1 ? 's' : ''} (${nameList}) provided below.\nTask hint: ${targetElementDescription}`;
  }
  return `Find: ${targetElementDescription}`;
};