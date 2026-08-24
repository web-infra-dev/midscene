export function systemPromptToLocateSection({
  responseInstructions,
}: {
  responseInstructions: string;
}) {
  return `
## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
- Find a section containing the target element
- If the description mentions reference elements, also locate sections containing those references

${responseInstructions}`;
}
