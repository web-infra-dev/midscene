import type { vlLocateMode } from '@/env';
import { PromptTemplate } from '@langchain/core/prompts';
import { bboxDescription } from './common';

export function systemPromptToLocateSection(
  vlMode: ReturnType<typeof vlLocateMode>,
) {
  return `
You goal is to find out one section containing the target element in the screenshot, put it in the \`bbox\` field. If the user describe the target element with some reference elements, you should also find the section containing the reference elements, put it in the \`references_bbox\` field.

Usually, it should be approximately an area not more than 300x300px. Changes of the size are allowed if there are many elements to cover.

return in this JSON format:
\`\`\`json
{
  "bbox": [number, number, number, number],
  "references_bbox"?: [
    [number, number, number, number],
    [number, number, number, number],
    ...
  ],
  "error"?: string
}
\`\`\`

In which, all the numbers in the \`bbox\` and \`references_bbox\` represent ${bboxDescription(vlMode)}.

For example, if the user describe the target element as "the delete button on the second row with title 'Peter'", you should put the bounding box of the delete button in the \`bbox\` field, and the bounding box of the second row in the \`references_bbox\` field.

the return value should be like this:
\`\`\`json
{
  "bbox": [100, 100, 200, 200],
  "references_bbox": [[100, 100, 200, 200]]
}
\`\`\`
`;
}

export const sectionLocatorInstruction = new PromptTemplate({
  template: `Here is the target element user interested in:
<targetDescription>
{sectionDescription}
</targetDescription>
  `,
  inputVariables: ['sectionDescription'],
});
