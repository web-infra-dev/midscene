import type {
  ParsedLocateResponse,
  StandardLocateProtocol,
} from '../model-adapter/locate-protocol';
import {
  type LocateResultPromptSpec,
  formatLocateExampleValue,
} from '../shared/model-locate-result';

const deepSeekRefBoxPattern =
  /<(?:｜｜|\|)ref(?:｜｜|\|)>\s*[\s\S]*?\s*<(?:｜｜|\|)\/ref(?:｜｜|\|)>\s*<(?:｜｜|\|)box(?:｜｜|\|)>\s*([\s\S]*?)\s*<(?:｜｜|\|)\/box(?:｜｜|\|)>/g;

const deepSeekPointPattern =
  /^\s*<(?:｜｜|\|)point(?:｜｜|\|)>\s*([\s\S]*?)\s*<(?:｜｜|\|)\/point(?:｜｜|\|)>\s*$/;

const deepSeekElementSystemPromptIntroduction = `## Role:
You are a GUI click grounding agent.

## Objective:
- Identify the UI element in the screenshot that matches the user's description.
- Return the center point of that element.`;

const buildDeepSeekElementResponseInstructions = (
  promptSpec: LocateResultPromptSpec,
) => `## Output Format:
Return exactly one ${promptSpec.resultNoun} using the following format, without any explanation or additional text:

<｜｜point｜｜>[${promptSpec.resultValueSchema}]<｜｜/point｜｜>

For example:
<｜｜point｜｜>[${formatLocateExampleValue(promptSpec.exampleValues[0])}]<｜｜/point｜｜>

Coordinate values must be integers.
Coordinate requirements: ${promptSpec.resultValueDescription}
The origin is the top-left of the full screenshot.`;

const buildDeepSeekSearchAreaResponseInstructions = (
  promptSpec: LocateResultPromptSpec,
) => {
  const targetExampleValue = formatLocateExampleValue(
    promptSpec.exampleValues[0],
  );
  const referenceExampleValue = formatLocateExampleValue(
    promptSpec.exampleValues[1] ?? promptSpec.exampleValues[0],
  );

  return `## Objective:
- Identify the target UI element in the screenshot.
- Identify the reference elements that the description uses to select the target, such as an owner label, row value, column value, nearby text, or relative-position anchor.
- Return a tight ${promptSpec.resultNoun} for the target first, followed by a tight ${promptSpec.resultNoun} for each reference element.

## Reference Rules:
- If the description explicitly identifies the target through another visible element, you MUST return that visible element as a reference, even if the target appears unique.
- For descriptions like "B in the row whose A is X", B is the target and the visible X is a reference.
- For descriptions like "the icon next to label X", the icon is the target and the visible X is a reference.
- Do not return unrelated landmarks or alternative target candidates.

## Output Format:
Return one or more ref-box pairs using the following format, without any explanation or additional text:

<｜｜ref｜｜>target: concise target description<｜｜/ref｜｜><｜｜box｜｜>[${promptSpec.resultValueSchema}]<｜｜/box｜｜>
<｜｜ref｜｜>reference: concise reference description<｜｜/ref｜｜><｜｜box｜｜>[${promptSpec.resultValueSchema}]<｜｜/box｜｜>

For example:
If the request is "the edit icon in the row whose project name is Apollo", return:
<｜｜ref｜｜>target: edit icon<｜｜/ref｜｜><｜｜box｜｜>[${targetExampleValue}]<｜｜/box｜｜>
<｜｜ref｜｜>reference: Apollo<｜｜/ref｜｜><｜｜box｜｜>[${referenceExampleValue}]<｜｜/box｜｜>

The first ref-box pair must represent the target element. Every remaining pair must represent a reference element needed to identify the target. If no reference element is needed, return only the target pair. Each pair must contain exactly one ${promptSpec.resultNoun}.
Coordinate values must be integers.
Coordinate requirements: ${promptSpec.resultValueDescription}
The origin is the top-left of the full screenshot.`;
};

export function parseDeepSeekLocateOutput(
  content: string,
): ParsedLocateResponse {
  const match = content.match(deepSeekPointPattern);
  if (!match) {
    throw new Error(
      'DeepSeek element locate response does not contain a valid <｜｜point｜｜>value<｜｜/point｜｜> result',
    );
  }

  return {
    kind: 'located',
    target: match[1],
  };
}

export function parseDeepSeekSearchAreaOutput(
  content: string,
): ParsedLocateResponse {
  const rawBoxes = Array.from(
    content.matchAll(deepSeekRefBoxPattern),
    (match) => match[1],
  );
  if (rawBoxes.length === 0) {
    throw new Error(
      'DeepSeek search-area response does not contain a valid <｜｜ref｜｜>label<｜｜/ref｜｜><｜｜box｜｜>[[x1,y1,x2,y2]]<｜｜/box｜｜> result',
    );
  }

  const [rawBbox, ...rawReferenceBboxes] = rawBoxes;
  return {
    kind: 'located',
    target: rawBbox,
    ...(rawReferenceBboxes.length > 0
      ? { references: rawReferenceBboxes }
      : {}),
  };
}

export const deepSeekElementLocateProtocol: StandardLocateProtocol = {
  systemPromptIntroduction: deepSeekElementSystemPromptIntroduction,
  buildResponseInstructions: buildDeepSeekElementResponseInstructions,
  buildUserPrompt: (targetElementDescription) =>
    `Locate the center point of the following UI element: ${targetElementDescription}`,
  expectedJsonObjectResponse: false,
  parseRawResponse: parseDeepSeekLocateOutput,
};

export const deepSeekSearchAreaProtocol: StandardLocateProtocol = {
  systemPromptIntroduction: '',
  buildResponseInstructions: buildDeepSeekSearchAreaResponseInstructions,
  buildUserPrompt: (sectionDescription) =>
    `Locate the target and the reference elements needed to distinguish it: ${sectionDescription}`,
  expectedJsonObjectResponse: false,
  parseRawResponse: parseDeepSeekSearchAreaOutput,
};
