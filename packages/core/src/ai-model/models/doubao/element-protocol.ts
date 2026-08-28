import type { StandardLocateProtocol } from '../../model-adapter/locate-protocol';
import type { LocateResultPromptSpec } from '../../shared/model-locate-result';
import { SEED_RESPONSE_PREFIX } from './constants';
import { parseDoubaoLocateOutput } from './locate-output-parser';
import {
  assertPointLocatePromptSpec,
  buildClickFunctionDefinition,
  buildClickToolCallExample,
} from './locate-shared';

const clickFunctionDefinition = buildClickFunctionDefinition();

const clickToolCallExample = buildClickToolCallExample({ point: 'x y' });

const buildElementResponseInstructions = (
  locatePromptSpec: LocateResultPromptSpec,
) => {
  assertPointLocatePromptSpec(locatePromptSpec);

  return `## Function Definition

- You have access to the following functions:
${JSON.stringify(clickFunctionDefinition)}

- To call a function, use the following structure without any suffix:

${SEED_RESPONSE_PREFIX}
${clickToolCallExample}

## Important Notes
- Return the exact XML structure shown above, including the <parameter name="point" string="true"> wrapper.
- Use integer coordinates following this definition: ${locatePromptSpec.resultValueDescription} The origin is the top-left of the full screenshot.
`;
};

export const doubaoElementProtocol: StandardLocateProtocol = {
  systemPromptIntroduction: [
    '## Role:',
    'You are a GUI click grounding agent.',
    '',
    '## Objective:',
    "- Identify elements in screenshots that match the user's description.",
    "- Provide the coordinates of the element that matches the user's description.",
  ].join('\n'),
  buildResponseInstructions: buildElementResponseInstructions,
  buildUserPrompt: (targetElementDescription: string) =>
    `## User Instruction: What element matches the following task: ${targetElementDescription}`,
  expectedJsonObjectResponse: false,
  parseRawResponse: parseDoubaoLocateOutput,
};
