import type { TModelFamily } from '@midscene/shared/env';
import { getPreferredLanguage } from '@midscene/shared/env';
import { bboxDescription } from './common';

/**
 * Check if the model family should use point mode (center point) instead of bbox mode.
 * Point mode asks the model to return a single center point [x, y],
 * which is then expanded into a bbox. This improves accuracy for models
 * that are better at identifying center points than bounding boxes.
 */
/**
 * Model families that use pixel coordinates in point mode.
 * Other point-mode families use 0-1000 normalized coordinates.
 */
export function usePixelCoordinates(
  modelFamily: TModelFamily | undefined,
): boolean {
  return modelFamily === 'gpt-5';
}

export function usePointMode(
  modelFamily: TModelFamily | undefined,
): boolean {
  if (process.env.MIDSCENE_FORCE_BBOX_MODE === '1') {
    return false;
  }
  return modelFamily === 'gpt-5' || modelFamily === 'doubao-vision' || modelFamily === 'qwen3.5';
}

export function systemPromptToLocateElement(
  modelFamily: TModelFamily | undefined,
) {
  const preferredLanguage = getPreferredLanguage();

  if (usePointMode(modelFamily)) {
    const isPixel = usePixelCoordinates(modelFamily);
    const coordDesc = isPixel
      ? 'center point as [x, y] in pixel coordinates'
      : 'center point as [x, y] normalized to 0-1000';
    const coordField = isPixel
      ? 'in pixel coordinates'
      : 'normalized to 0-1000 range';
    const examplePoint = isPixel ? '[150, 150]' : '[500, 500]';

    return `
## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
- Identify elements in screenshots that match the user's description.
- Provide the center point coordinate of the element that matches the user's description.

## Important Notes for Locating Elements:
- When the user describes an element that contains text (such as buttons, input fields, dropdown options, radio buttons, etc.), you should locate ONLY the text region of that element, not the entire element boundary.
- For example: If an input field is large (both wide and tall) with a placeholder text "Please enter your comment", you should locate only the center of where the placeholder text appears, not the center of the entire input field.
- This principle applies to all text-containing elements: focus on the visible text region rather than the full element container.

## Output Format:
\`\`\`json
{
  "point": [number, number],  // ${coordDesc}
  "errors"?: string[]
}
\`\`\`

Fields:
* \`point\` is the center point [x, y] of the element that matches the user's description, ${coordField}
* \`errors\` is an optional array of error messages (if any)

For example, when an element is found:
\`\`\`json
{
  "point": ${examplePoint},
  "errors": []
}
\`\`\`

When no element is found:
\`\`\`json
{
  "point": [],
  "errors": ["I can see ..., but {some element} is not found. Use ${preferredLanguage}."]
}
\`\`\`
`;
  }

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

export const findElementPrompt = (targetElementDescription: string) =>
  `Find: ${targetElementDescription}`;
