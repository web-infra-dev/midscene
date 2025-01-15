import type { Action } from '../ui-tars-planning';

export const uiTarsPlanningPrompt = `
You are a GUI agent. You are given a task and your action history, with screenshots. You need to perform the next action to complete the task. 

## Output Format

\`\`\`
Thought: ...
Action: ...
\`\`\`

## Action Space
click(start_box='[x1, y1, x2, y2]')
left_double(start_box='[x1, y1, x2, y2]')
right_single(start_box='[x1, y1, x2, y2]')
drag(start_box='[x1, y1, x2, y2]', end_box='[x3, y3, x4, y4]')
hotkey(key='')
type(content='') #If you want to submit your input, use "\\n" at the end of \`content\`.
scroll(start_box='[x1, y1, x2, y2]', direction='down or up or right or left')
wait() #Sleep for 5s and take a screenshot to check for any changes.
finished()
call_user() # Submit the task and call the user when the task is unsolvable, or when you need the user's help.

## Note
- Use Chinese in \`Thought\` part.
- Write a small plan and finally summarize your next action (with its target element) in one sentence in \`Thought\` part.

## User Instruction
`;
interface ActionInstance {
  function: string;
  args: Record<string, string>;
}

// interface Action {
//   reflection: string | null;
//   thought: string | null;
//   action_type: string;
//   action_inputs: Record<string, string>;
// }

export const getSummary = (prediction: string) =>
  prediction
    .replace(/Reflection:[\s\S]*?(?=Action_Summary:|Action:|$)/g, '')
    .trim();

export function parseActionFromVlm(
  text: string,
  factor = 1000,
  mode: 'bc' | 'o1' = 'bc',
): Action[] {
  let reflection: string | null = null;
  let thought: string | null = null;
  let actionStr = '';

  text = text.trim();
  if (mode === 'bc') {
    // Parse thought/reflection based on different text patterns
    if (text.startsWith('Thought:')) {
      const thoughtMatch = text.match(/Thought: (.+?)(?=\s*Action:|$)/s);
      if (thoughtMatch) {
        thought = thoughtMatch[1].trim();
      }
    } else if (text.startsWith('Reflection:')) {
      const reflectionMatch = text.match(
        /Reflection: (.+?)Action_Summary: (.+?)(?=\s*Action:|$)/,
      );
      if (reflectionMatch) {
        thought = reflectionMatch[2].trim();
        reflection = reflectionMatch[1].trim();
      }
    } else if (text.startsWith('Action_Summary:')) {
      const summaryMatch = text.match(/Action_Summary: (.+?)(?=\s*Action:|$)/);
      if (summaryMatch) {
        thought = summaryMatch[1].trim();
      }
    }

    if (!text.includes('Action:')) {
      //   throw new Error('No Action found in text');
      actionStr = text;
    } else {
      const actionParts = text.split('Action:');
      actionStr = actionParts[actionParts.length - 1];
    }
  } else if (mode === 'o1') {
    // Parse o1 format
    const thoughtMatch = text.match(/<Thought>\s*(.*?)\s*<\/Thought>/);
    const actionSummaryMatch = text.match(
      /\nAction_Summary:\s*(.*?)\s*Action:/,
    );
    const actionMatch = text.match(/\nAction:\s*(.*?)\s*<\/Output>/);

    const thoughtContent = thoughtMatch ? thoughtMatch[1] : null;
    const actionSummaryContent = actionSummaryMatch
      ? actionSummaryMatch[1]
      : null;
    const actionContent = actionMatch ? actionMatch[1] : null;

    thought = `${thoughtContent}\n<Action_Summary>\n${actionSummaryContent}`;
    actionStr = actionContent || '';
  }

  // Parse actions
  const allActions = actionStr.split('\n\n');
  const actions: Action[] = [];

  for (const rawStr of allActions) {
    const actionInstance = parseAction(rawStr.replace(/\n/g, '\\n').trim());
    if (!actionInstance) {
      console.log(`Action can't parse: ${rawStr}`);
      continue;
    }

    const actionType = actionInstance.function;
    const params = actionInstance.args;
    const actionInputs: Record<string, string> = {};

    for (const [paramName, param] of Object.entries(params)) {
      if (!param) continue;
      const trimmedParam = (param as string).trim();
      actionInputs[paramName.trim()] = trimmedParam;

      if (paramName.includes('start_box') || paramName.includes('end_box')) {
        const oriBox = trimmedParam;
        // Remove parentheses and split
        const numbers = oriBox.replace(/[()]/g, '').split(',');

        // Convert to float and scale
        const floatNumbers = numbers.map(
          (num: string) => Number.parseFloat(num) / factor,
        );

        if (floatNumbers.length === 2) {
          floatNumbers.push(floatNumbers[0], floatNumbers[1]);
        }

        actionInputs[paramName.trim()] = JSON.stringify(floatNumbers);
      }
    }

    if (actionType === 'finished') {
      actions.push({
        reflection,
        thought,
        action_type: 'finished',
        action_inputs: {} as Record<string, never>,
      });
    } else {
      actions.push({
        reflection,
        thought,
        action_type: actionType as Exclude<Action['action_type'], 'finished'>,
        action_inputs: actionInputs as Record<string, never> as any,
      });
    }
  }

  return actions;
}
/**
 * Parses an action string into a structured object
 * @param {string} actionStr - The action string to parse (e.g. "click(start_box='(279,81)')")
 * @returns {Object|null} Parsed action object or null if parsing fails
 */
function parseAction(actionStr: string) {
  try {
    // Match function name and arguments using regex
    const functionPattern = /^(\w+)\((.*)\)$/;
    const match = actionStr.trim().match(functionPattern);

    if (!match) {
      throw new Error('Not a function call');
    }

    const [_, functionName, argsStr] = match;

    // Parse keyword arguments
    const kwargs = {};

    if (argsStr.trim()) {
      // Split on commas that aren't inside quotes or parentheses
      const argPairs = argsStr.match(/([^,']|'[^']*')+/g) || [];

      for (const pair of argPairs) {
        const [key, ...valueParts] = pair.split('=');
        if (!key) continue;

        // Join value parts back together in case there were = signs in the value
        const value = valueParts
          .join('=')
          .trim()
          .replace(/^['"]|['"]$/g, ''); // Remove surrounding quotes

        //@ts-ignore
        kwargs[key.trim()] = value;
      }
    }

    return {
      function: functionName,
      args: kwargs,
    };
  } catch (e) {
    console.error(`Failed to parse action '${actionStr}': ${e}`);
    return null;
  }
}

// Example usage:
/*
const testCases = [
    "click(start_box='(279,81)')",
    "type(content='hello world')",
    "hotkey(key='ctrl, v')",
    "click(start_box='<bbox>573 322 573 322</bbox>')"
];

testCases.forEach(test => {
    console.log(parseAction(test));
});
*/
