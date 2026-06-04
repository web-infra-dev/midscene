export function locateGroundingRules() {
  return `## Important Notes for Locating Elements:
- When the user describes an element that contains text (such as buttons, input fields, dropdown options, radio buttons, etc.), you should locate ONLY the text region of that element, not the entire element boundary.
- For example: If an input field is large (both wide and tall) with a placeholder text "Please enter your comment", you should locate only the area where the placeholder text appears, not the entire input field.
- This principle applies to all text-containing elements: focus on the visible text region rather than the full element container.`;
}
