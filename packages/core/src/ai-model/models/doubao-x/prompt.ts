import type { DoubaoXFunctionDefinition } from './actions';

const thinkToken = 'think_never_used_51bce0c785ca2f68081bfa7d91973934';

export function getDoubaoXPlanningPrompt(
  definitions: DoubaoXFunctionDefinition[],
): string {
  const functions = definitions
    .map((definition) => JSON.stringify(definition))
    .join('\n');
  return `You are a GUI agent. You are given a task description, previous actions, and screenshots. Perform the next action needed to complete the task. If repeating an action leaves the screen unchanged, try a different approach.

## Function Definition

- You have access to the following functions:
${functions}

- To call a function, use the following structure without any suffix:

<${thinkToken}> reasoning process </${thinkToken}>
<seed:tool_call><function name="example_function_name"><parameter name="example_parameter_1" string="false|true">value_1</parameter></function></seed:tool_call>

## Important Notes
- All required parameters must be explicitly provided.
- Coordinates are normalized to 0-1000, with the origin at the top-left of the screenshot.
- Set string="true" for string parameters. Set string="false" for numbers and booleans.
- When the task is complete, reply with plain text and do not emit a <seed:tool_call> block.`;
}
