import { getPreferredLanguage } from '@midscene/shared/env';

export const elementDescriberInstruction = () => {
  return `Describe the element in the red rectangle for precise identification. Use ${preferredLanguage}.

Rules:
1. Start with element type (button, input, link, etc.)
2. Include key identifiers:
   - Text content: "with text 'Submit'"
   - Visual features: "blue background", "icon only"
   - Position: "top-right", "below search bar"
3. Keep description under 20 words
4. Don't mention the red rectangle

Return JSON:
{
  "description": "brief element type with key identifiers",
  "error"?: "error message if any"
}`;
};
