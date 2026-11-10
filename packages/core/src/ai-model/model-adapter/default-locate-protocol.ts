import { getPreferredLanguage } from '@midscene/shared/env';
import {
  type JsonParser,
  type JsonParserSource,
  assertJsonObject,
} from '../shared/json';
import {
  type LocateResultPromptSpec,
  formatLocateExampleValue,
} from '../shared/model-locate-result';
import { readLocateResultField } from '../shared/model-locate-result/result-field';
import type {
  ParsedLocateResponse,
  StandardLocateProtocol,
  StandardLocateProtocolContext,
} from './locate-protocol';

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

type ParseRawResponseOptions = {
  includeReferences: boolean;
};

const createParseRawResponse =
  (
    jsonParser: JsonParser,
    source: JsonParserSource,
    options: ParseRawResponseOptions,
  ) =>
  (
    content: string,
    promptSpec: LocateResultPromptSpec,
  ): ParsedLocateResponse => {
    const parsedResponse = jsonParser(content, {
      source,
    });
    assertJsonObject(parsedResponse);
    const record = parsedResponse;
    const target = readLocateResultField(record, promptSpec);
    const error = typeof record.error === 'string' ? record.error : undefined;
    if (target === undefined) {
      throw new Error(
        `Missing required coordinate field "${promptSpec.resultKey}". Expected "${promptSpec.resultKey}": ${promptSpec.resultValueSchema}; use an empty array when no element is found.${error ? ` Model error: ${error}` : ''}`,
      );
    }
    if (Array.isArray(target) && target.length === 0) {
      return { kind: 'not-found', ...(error ? { error } : {}) };
    }

    if (!options.includeReferences) {
      return { kind: 'located', target, ...(error ? { error } : {}) };
    }

    const rawReferences = readLocateResultField(
      record,
      promptSpec,
      'references_',
    );
    const references =
      rawReferences === undefined || rawReferences === null
        ? undefined
        : Array.isArray(rawReferences)
          ? rawReferences
          : [rawReferences];
    return {
      kind: 'located',
      target,
      ...(references?.length ? { references } : {}),
      ...(error ? { error } : {}),
    };
  };

export const createDefaultElementProtocol = ({
  jsonParser,
}: StandardLocateProtocolContext): StandardLocateProtocol => ({
  systemPromptIntroduction: defaultLocateSystemPromptIntroduction,
  buildResponseInstructions,
  buildUserPrompt,
  expectedJsonObjectResponse: true,
  parseRawResponse: createParseRawResponse(jsonParser, 'locate', {
    includeReferences: false,
  }),
});

export const createDefaultSearchAreaProtocol = ({
  jsonParser,
}: StandardLocateProtocolContext): StandardLocateProtocol => ({
  systemPromptIntroduction: defaultSearchAreaSystemPromptIntroduction,
  buildResponseInstructions: buildSearchAreaResponseInstructions,
  buildUserPrompt: buildSearchAreaUserPrompt,
  expectedJsonObjectResponse: true,
  parseRawResponse: createParseRawResponse(jsonParser, 'section-locator', {
    includeReferences: true,
  }),
});
