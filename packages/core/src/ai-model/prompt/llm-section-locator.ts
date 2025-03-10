import { PromptTemplate } from '@langchain/core/prompts';

export function systemPromptToLocateSection() {
  return `
You goal is to find out some sections in the screenshot (or the section containing the target element) that the user is interested in. Make sure to include everything the user mentioned in this section.

Usually, it should be approximately an area not more than 300x300px. Changes of the size are allowed.

return in this JSON format:
\`\`\`json
{
  "bbox_2d": [number, number, number, number],
  "error"?: string
}
\`\`\`
`;
}

export const sectionLocatorInstruction = new PromptTemplate({
  template: `Here is the section user interested in:
<sectionDescription>
{sectionDescription}
</sectionDescription>
  `,
  inputVariables: ['sectionDescription'],
});
