import { getPreferredLanguage } from '@midscene/shared/env';

export const elementDescriberInstruction = () => {
  return `Tell what is the content of the element wrapped by the read rectangle in the screenshot. Your description is expected to be used to precisely locate the element from other similar elements on screenshot. Use ${getPreferredLanguage()} in the description.

Please follow the following rules:
1. The description should be start with a brief description, like "a button for confirming the action".

2. Include these information in the description to distinguish the element from its siblings and other similar elements, as much as possible:
- The text of the element, like "with text 'Confirm'"
- What the element looks like if it's an image, like "with image '...'"
- The relative position of the element, like "on the left of ..., around ..."
- How to distinguish the element from its siblings elements, like "it is the icon instead of the text"

3. Do NOT mention the red rectangle in the description.

4. Use the error field to describe the unexpected situations, if any. If not, put null.

Return in JSON:
{
  "description": "[{brief description}]: {text of the element} {image of the element} {relative position of the element} ... ",
  "error"?: "..."
}`;
};
