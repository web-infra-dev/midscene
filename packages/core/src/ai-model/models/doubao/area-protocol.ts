import type { StandardLocateProtocol } from '../../model-adapter/locate-protocol';
import type { LocateResultPromptSpec } from '../../shared/model-locate-result';
import { SEED_RESPONSE_PREFIX, SEED_TOOL_CALL_TAG_NAME } from './constants';
import { parseDoubaoSearchAreaOutput } from './locate-output-parser';
import {
  assertPointLocatePromptSpec,
  buildClickFunctionDefinition,
  buildClickToolCallExample,
} from './locate-shared';

const clickFunctionDefinition = buildClickFunctionDefinition({
  includeRole: true,
});

const rowTargetClickToolCallExample = buildClickToolCallExample({
  role: 'target',
  point: '680 460',
});
const rowReferenceClickToolCallExample = buildClickToolCallExample({
  role: 'reference',
  point: '320 460',
});
const betweenTargetClickToolCallExample = buildClickToolCallExample({
  role: 'target',
  point: '500 460',
});
const betweenLeftReferenceClickToolCallExample = buildClickToolCallExample({
  role: 'reference',
  point: '320 460',
});
const betweenRightReferenceClickToolCallExample = buildClickToolCallExample({
  role: 'reference',
  point: '680 460',
});

const buildSearchAreaResponseInstructions = (
  locatePromptSpec: LocateResultPromptSpec,
) => {
  assertPointLocatePromptSpec(locatePromptSpec);

  return `## Objective

- Locate exactly one target element that the user ultimately wants to operate.
- Locate every visible reference element used by the description to identify that target.

## Target and Reference Rules

- A reference is any other visible UI element or text used to distinguish, select, or describe the target.
- Row values, column values, labels, nearby controls, relative-position anchors, ordinal-position anchors, containers, and endpoints are references when the description uses them to identify the target.
- If the description uses a row, column, relative position, ordinal position, ownership, containment, or endpoints to identify the target, every visible element that expresses those constraints MUST be returned as a reference.
- Do not omit a reference merely because the target appears unique.
- Return the target as the first click tool call.
- Return one additional click tool call for every visible reference element after the target. The total number of click tool calls must be one plus the number of visible references.
- A response containing only the target is invalid when the description uses any visible element to identify the target.
- Do not repeat the target point as a reference.
- Do not return elements unrelated to identifying the target. An element participating in a row, column, relative-position, ordinal-position, ownership, containment, or endpoint constraint is related and MUST be returned.

## Function Definition

- You have access to the following functions:
${JSON.stringify(clickFunctionDefinition)}

- Return one or more click tool calls using the following structure without any suffix.

For the description "the price in the row whose product name is Tomato", return the visible "$3.00" text as the target, followed by the visible "Tomato" text as its reference:

${SEED_RESPONSE_PREFIX}
${rowTargetClickToolCallExample}
${rowReferenceClickToolCallExample}

For the description "the plus button between the Start and End nodes", return the plus icon as the target, followed by both endpoint nodes as references:

${SEED_RESPONSE_PREFIX}
${betweenTargetClickToolCallExample}
${betweenLeftReferenceClickToolCallExample}
${betweenRightReferenceClickToolCallExample}

## Important Notes
- Return each point as a separate <${SEED_TOOL_CALL_TAG_NAME}> block, including both the <parameter name="role" string="true"> and <parameter name="point" string="true"> wrappers.
- Use integer coordinates following this definition: ${locatePromptSpec.resultValueDescription} The origin is the top-left of the full screenshot.
`;
};

export const doubaoSearchAreaProtocol: StandardLocateProtocol = {
  systemPromptIntroduction: ['## Role:', 'You are a GUI grounding agent.'].join(
    '\n',
  ),
  buildResponseInstructions: buildSearchAreaResponseInstructions,
  buildUserPrompt: (sectionDescription) =>
    `Locate the target and all visible reference elements used to identify it: ${sectionDescription}`,
  expectedJsonObjectResponse: false,
  parseRawResponse: parseDoubaoSearchAreaOutput,
};
