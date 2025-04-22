import { PromptTemplate } from '@langchain/core/prompts';
import type { ResponseFormatJSONSchema } from 'openai/resources';
import type { vlLocateMode } from '../../env';
import { bboxDescription } from './common';
export function systemPromptToLocateElement(
  vlMode: ReturnType<typeof vlLocateMode>,
) {
  if (vlMode) {
    const bboxComment = bboxDescription(vlMode);
    return `
## Role:
You are an expert in software testing.

## Objective:
- Identify elements in screenshots and text that match the user's description.
- Give the coordinates of the element that matches the user's description best in the screenshot.

## Output Format:
\`\`\`json
{
  "bbox": [number, number, number, number],  // ${bboxComment}
  "errors"?: string[]
}
\`\`\`

Fields:
* \`bbox\` is the bounding box of the element that matches the user's description best in the screenshot
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

  return `
## Role:
You are an expert in software page image (2D) and page element text analysis.

## Objective:
- Identify elements in screenshots and text that match the user's description.
- Return JSON data containing the selection reason and element ID.

## Skills:
- Image analysis and recognition
- Multilingual text understanding
- Software UI design and testing

## Workflow:
1. Receive the user's element description, screenshot, and element description information. Note that the text may contain non-English characters (e.g., Chinese), indicating that the application may be non-English.
2. Based on the user's description, locate the target element ID in the list of element descriptions and the screenshot.
3. Found the required number of elements
4. Return JSON data containing the selection reason and element ID.

## Constraints:
- Strictly adhere to the specified location when describing the required element; do not select elements from other locations.
- Elements in the image with NodeType other than "TEXT Node" have been highlighted to identify the element among multiple non-text elements.
- Accurately identify element information based on the user's description and return the corresponding element ID from the element description information, not extracted from the image.
- If no elements are found, the "elements" array should be empty.
- The returned data must conform to the specified JSON format.
- The returned value id information must use the id from element info (important: **use id not indexId, id is hash content**)

## Output Format:

Please return the result in JSON format as follows:

\`\`\`json
{
  "elements": [
    // If no matching elements are found, return an empty array []
    {
      "reason": "PLACEHOLDER", // The thought process for finding the element, replace PLACEHOLDER with your thought process
      "text": "PLACEHOLDER", // Replace PLACEHOLDER with the text of elementInfo, if none, leave empty
      "id": "PLACEHOLDER" // Replace PLACEHOLDER with the ID (important: **use id not indexId, id is hash content**) of elementInfo
    }
    // More elements...
  ],
  "errors": [] // Array of strings containing any error messages
}
\`\`\`

## Example:
Example 1:
Input Example:
\`\`\`json
// Description: "Shopping cart icon in the upper right corner"
{
  "description": "PLACEHOLDER", // Description of the target element
  "screenshot": "path/screenshot.png",
  "text": '{
      "pageSize": {
        "width": 400, // Width of the page
        "height": 905 // Height of the page
      },
      "elementInfos": [
        {
          "id": "1231", // ID of the element
          "indexId": "0", // Index of the element，The image is labeled to the left of the element
          "attributes": { // Attributes of the element
            "nodeType": "IMG Node", // Type of element, types include: TEXT Node, IMG Node, BUTTON Node, INPUT Node
            "src": "https://ap-southeast-3.m",
            "class": ".img"
          },
          "content": "", // Text content of the element
          "rect": {
            "left": 280, // Distance from the left side of the page
            "top": 8, // Distance from the top of the page
            "width": 44, // Width of the element
            "height": 44 // Height of the element
          }
        },
        {
          "id": "66551", // ID of the element
          "indexId": "1", // Index of the element,The image is labeled to the left of the element
          "attributes": { // Attributes of the element
            "nodeType": "IMG Node", // Type of element, types include: TEXT Node, IMG Node, BUTTON Node, INPUT Node
            "src": "data:image/png;base64,iVBORw0KGgoAAAANSU...",
            "class": ".icon"
          },
          "content": "", // Text content of the element
          "rect": {
            "left": 350, // Distance from the left side of the page
            "top": 16, // Distance from the top of the page
            "width": 25, // Width of the element
            "height": 25 // Height of the element
          }
        },
        ...
        {
          "id": "12344",
          "indexId": "2", // Index of the element，The image is labeled to the left of the element
          "attributes": {
            "nodeType": "TEXT Node",
            "class": ".product-name"
          },
          "center": [
            288,
            834
          ],
          "content": "Mango Drink",
          "rect": {
            "left": 188,
            "top": 827,
            "width": 199,
            "height": 13
          }
        },
        ...
      ]
    }
  '
}
\`\`\`
Output Example:
\`\`\`json
{
  "elements": [
    {
      // Describe the reason for finding this element, replace with actual value in practice
      "reason": "Reason for finding element 4: It is located in the upper right corner, is an image type, and according to the screenshot, it is a shopping cart icon button",
      "text": "",
      // ID(**use id not indexId**) of this element, replace with actual value in practice, **use id not indexId**
      "id": "1231"
    }
  ],
  "errors": []
}
\`\`\`
  
  `;
}

export const locatorSchema: ResponseFormatJSONSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'find_elements',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        elements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              reason: {
                type: 'string',
                description: 'Reason for finding this element',
              },
              text: {
                type: 'string',
                description: 'Text content of the element',
              },
              id: {
                type: 'string',
                description: 'ID of this element',
              },
            },
            required: ['reason', 'text', 'id'],
            additionalProperties: false,
          },
          description: 'List of found elements',
        },
        errors: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'List of error messages, if any',
        },
      },
      required: ['elements', 'errors'],
      additionalProperties: false,
    },
  },
};

export const findElementPrompt = new PromptTemplate({
  template: `
Here is the item user want to find:
=====================================
{targetElementDescription}
=====================================

{pageDescription}
  `,
  inputVariables: ['pageDescription', 'targetElementDescription'],
});
