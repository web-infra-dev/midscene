import { PromptTemplate } from '@langchain/core/prompts';
import type { TVlModeTypes } from '@midscene/shared/env';
import { bboxDescription } from './common';

export function systemPromptToLocateSection(vlMode: TVlModeTypes | undefined) {
  return `
## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
- Find a section (approximately 300x300px) containing the target element
- If the description mentions reference elements, also locate sections containing those references

## Output Format:
\`\`\`json
{
  "bbox": [number, number, number, number],
  "references_bbox"?: [
    [number, number, number, number],
    ...
  ],
  "error"?: string
}
\`\`\`

Fields:
* \`bbox\` - Bounding box of the section containing the target element. Coordinates are ${bboxDescription(vlMode)}.
* \`references_bbox\` - Optional array of bounding boxes for reference elements
* \`error\` - Optional error message if the section cannot be found

Example:
If the description is "delete button on the second row with title 'Peter'", return:
\`\`\`json
{
  "bbox": [100, 100, 200, 200],
  "references_bbox": [[100, 100, 200, 200]]
}
\`\`\`
`;
}

export const sectionLocatorInstruction = new PromptTemplate({
  template: 'Find section containing: {sectionDescription}',
  inputVariables: ['sectionDescription'],
});
