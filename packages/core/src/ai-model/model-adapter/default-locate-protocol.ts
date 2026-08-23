import { getPreferredLanguage } from '@midscene/shared/env';
import type { JsonParser, JsonParserSource } from '../shared/json';
import {
  type LocateResultPromptSpec,
  formatLocateExampleValue,
} from '../shared/model-locate-result';
import type { StandardLocateProtocolFactory } from './locate-protocol';

const markdownCodeFence = '```';

const defaultLocateSystemPromptIntroduction = `## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
- Identify elements in screenshots that match the user's description.
- Provide the coordinates of the element that matches the user's description.`;

const defaultSearchAreaSystemPromptIntroduction = `## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
- Find a section containing the target element
- If the description mentions reference elements, also locate sections containing those references`;

const buildResponseInstructions = (promptSpec: LocateResultPromptSpec) => {
  const preferredLanguage = getPreferredLanguage();
  const resultKey = promptSpec.resultKey;
  const exampleValueText = formatLocateExampleValue(
    promptSpec.exampleValues[0],
  );
  const resultFieldDescription = `the ${promptSpec.resultNoun} of the element that matches the user's description`;
  return `## Output Format:
${markdownCodeFence}json
{
  "${resultKey}": ${promptSpec.resultValueSchema},  // ${promptSpec.resultValueDescription}
  "error": string // optional
}
${markdownCodeFence}

Fields:
* \`${resultKey}\` is ${resultFieldDescription}
* \`error\` is an optional error message (if any)

For example, when an element is found:
${markdownCodeFence}json
{
  "${resultKey}": ${exampleValueText}
}
${markdownCodeFence}

When no element is found:
${markdownCodeFence}json
{
  "${resultKey}": [],
  "error": "I can see ..., but {some element} is not found. Use ${preferredLanguage}."
}
${markdownCodeFence}
`;
};

const buildUserPrompt = (targetElementDescription: string) =>
  `Find: ${targetElementDescription}`;

const buildSearchAreaResponseInstructions = (
  promptSpec: LocateResultPromptSpec,
) => {
  const preferredLanguage = getPreferredLanguage();
  const resultKey = promptSpec.resultKey;
  const exampleValueText = formatLocateExampleValue(
    promptSpec.exampleValues[0],
  );
  const resultJsonProperty = `"${resultKey}": ${promptSpec.resultValueSchema},  // ${promptSpec.resultValueDescription}`;
  const resultFieldDescription = `${promptSpec.resultNoun} of the section containing the target element`;
  const referenceFieldDescription = `Optional array of ${promptSpec.resultNounPlural} of reference elements`;
  return `## Output Format:
${markdownCodeFence}json
{
  ${resultJsonProperty}
  "references_${resultKey}"?: [
    ${promptSpec.resultValueSchema},
    ...
  ],
  "error"?: string
}
${markdownCodeFence}

Fields:
* \`${resultKey}\` - ${resultFieldDescription}
* \`references_${resultKey}\` - ${referenceFieldDescription}
* \`error\` - Optional error message if the section cannot be found. Use ${preferredLanguage}.

Example:
If the description is "delete button on the second row with title 'Peter'", return:
${markdownCodeFence}json
{
  "${resultKey}": ${exampleValueText},
  "references_${resultKey}": [${exampleValueText}]
}
${markdownCodeFence}
`;
};

const buildSearchAreaUserPrompt = (sectionDescription: string) =>
  `Find section containing: ${sectionDescription}`;

const createParseRawResponse =
  (jsonParser: JsonParser, source: JsonParserSource) => (content: string) => {
    const parsedResponse = jsonParser(content, {
      source,
    });
    if (!parsedResponse || typeof parsedResponse !== 'object') {
      throw new Error(`Failed to parse JSON locate response: ${content}`);
    }
    return parsedResponse as Record<string, unknown>;
  };

export const createDefaultElementProtocol: StandardLocateProtocolFactory = ({
  jsonParser,
}) => ({
  systemPromptIntroduction: defaultLocateSystemPromptIntroduction,
  buildResponseInstructions,
  buildUserPrompt,
  expectedJsonObjectResponse: true,
  parseRawResponse: createParseRawResponse(jsonParser, 'locate'),
});

export const createDefaultSearchAreaProtocol: StandardLocateProtocolFactory = ({
  jsonParser,
}) => ({
  systemPromptIntroduction: defaultSearchAreaSystemPromptIntroduction,
  buildResponseInstructions: buildSearchAreaResponseInstructions,
  buildUserPrompt: buildSearchAreaUserPrompt,
  expectedJsonObjectResponse: true,
  parseRawResponse: createParseRawResponse(jsonParser, 'section-locator'),
});
