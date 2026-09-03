import type {
  ParsedLocateResponse,
  StandardLocateProtocol,
} from '../../model-adapter/locate-protocol';
import type { LocateResultPromptSpec } from '../../shared/model-locate-result';
import { parseQwenToolCall, serializeQwenToolCall } from './tool-call';

const buildResponseInstructions = (promptSpec: LocateResultPromptSpec) => {
  // Use the demo's base computer_use click action, not Midscene's Tap action.
  const toolDefinition = {
    type: 'function',
    function: {
      name: 'computer_use',
      description: 'Use a mouse to interact with a computer.',
      parameters: {
        type: 'object',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            description:
              'left_click: Click the left mouse button at the requested element. terminate: End the task if the element cannot be found.',
            enum: ['left_click', 'terminate'],
          },
          coordinate: {
            type: 'array',
            description: `(x, y) coordinates. Required by action=left_click. Format: ${promptSpec.resultValueSchema}. ${promptSpec.resultValueDescription}`,
          },
          status: {
            type: 'string',
            description: 'Task status for terminate.',
            enum: ['success', 'failure'],
          },
        },
      },
    },
  };
  const clickExample = serializeQwenToolCall({
    functionName: 'computer_use',
    parameters: [
      { name: 'action', value: 'left_click' },
      { name: 'coordinate', value: promptSpec.exampleValues[0] },
    ],
  });
  const notFoundExample = serializeQwenToolCall({
    functionName: 'computer_use',
    parameters: [
      { name: 'action', value: 'terminate' },
      { name: 'status', value: 'failure' },
    ],
  });

  return `## Tools

You have access to the following functions:

<tools>
${JSON.stringify(toolDefinition)}
</tools>

## Output Format

Return one computer_use function call with action=left_click and the center coordinate of the requested element:

${clickExample}

If the requested element cannot be found, use action=terminate with status=failure:

${notFoundExample}

- Function calls MUST follow the specified format: an inner <function=...></function> block must be nested within <tool_call></tool_call> XML tags.
- Required parameters MUST be specified.
- Encode coordinate as a JSON array of exactly two integers.
- Coordinate requirements: ${promptSpec.resultValueDescription}
- The origin is the top-left of the screenshot provided in this request.
- You may provide optional reasoning in natural language BEFORE the function call, but NOT after.
- Return exactly one tool call. Do not return a target description parameter.`;
};

const parseRawResponse = (content: string): ParsedLocateResponse => {
  const toolCall = parseQwenToolCall(content);
  if (!toolCall || toolCall.functionName !== 'computer_use') {
    throw new Error('Qwen locate response requires a computer_use tool call');
  }

  const actions = toolCall.parameters.filter(({ name }) => name === 'action');
  if (actions.length !== 1) {
    throw new Error(
      'Qwen locate response requires exactly one action parameter',
    );
  }

  if (actions[0].rawValue === 'terminate') {
    const statuses = toolCall.parameters.filter(
      ({ name }) => name === 'status',
    );
    if (statuses.length !== 1 || statuses[0].rawValue !== 'failure') {
      throw new Error('Qwen locate termination requires status=failure');
    }
    return {
      kind: 'not-found',
      error: 'Qwen could not find the requested element',
    };
  }

  if (actions[0].rawValue !== 'left_click') {
    throw new Error(`Unsupported Qwen locate action: ${actions[0].rawValue}`);
  }

  const coordinates = toolCall.parameters.filter(
    ({ name }) => name === 'coordinate',
  );
  if (coordinates.length !== 1 || !coordinates[0].rawValue) {
    throw new Error(
      'Qwen locate response requires exactly one coordinate parameter',
    );
  }

  // Leave JSON coordinate decoding and pixel mapping to the result codec.
  return { kind: 'located', target: coordinates[0].rawValue };
};

export const qwenElementProtocol: StandardLocateProtocol = {
  systemPromptIntroduction: `## Role:
You are an AI assistant that helps identify UI elements.

## Objective:
- Identify the UI element in the screenshot that matches the user's description.
- Provide its center coordinate using the computer_use function.`,
  buildResponseInstructions,
  buildUserPrompt: (targetElementDescription) =>
    `Find: ${targetElementDescription}`,
  expectedJsonObjectResponse: false,
  parseRawResponse,
};
