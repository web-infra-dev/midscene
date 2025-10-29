import { PromptTemplate } from '@langchain/core/prompts';
import type { TVlModeTypes } from '@midscene/shared/env';
import { bboxDescription } from './common';
export function systemPromptToLocateElement(vlMode: TVlModeTypes | undefined) {
  const bboxComment = bboxDescription(vlMode);
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
  "errors": ["I can see ..., but {some element} is not found"]
}
\`\`\`
`;
}

export const findElementPrompt = new PromptTemplate({
  template: 'Find: {targetElementDescription}',
  inputVariables: ['targetElementDescription'],
});
