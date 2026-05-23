import type { TModelFamily } from '@midscene/shared/env';
import { getPreferredLanguage } from '@midscene/shared/env';
import { bboxDescription } from './common';
export function systemPromptToLocateElement(
  modelFamily: TModelFamily | undefined,
) {
  const preferredLanguage = getPreferredLanguage();
  const bboxComment = bboxDescription(modelFamily);
  const xmlBoundsNote =
    modelFamily === 'gemini'
      ? `- XML bounds grounding for Gemini (STRICT):
  - Rule: For Gemini, bbox must be [ymin, xmin, ymax, xmax] normalized to 0-1000.
  - If XML bounds are [left,top][right,bottom] and screenshot size is W x H:
    - ymin = top / H * 1000
    - xmin = left / W * 1000
    - ymax = bottom / H * 1000
    - xmax = right / W * 1000
  - Never copy XML pixel bounds directly.
  - Example:
    - XML bounds="[864,783][986,851]" on a 1080x2400 screenshot
    - Correct bbox: [326,800,355,913]
    - Wrong bbox: [783,864,851,986]`
      : '- XML bounds must be converted to the required bbox format before output. Do NOT return raw XML bounds directly.';
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
- If page structure XML is provided, use it as structured evidence for exact text, resource-id, class, state annotations, and bounds. Prefer XML bounds over screenshot-only estimates when the XML element matches the visible target.
- XML bounds are raw screen pixel coordinates formatted as [left,top][right,bottom]. They are evidence, not the final answer format.
${xmlBoundsNote}

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
  extraLocateContext?: string,
) => {
  const contextText = extraLocateContext?.trim();
  if (!contextText) {
    return `Find: ${targetElementDescription}`;
  }

  return `Page structure context:
${contextText}

Find: ${targetElementDescription}`;
};
