import type { LocateResultPromptSpec } from '../../shared/model-locate-result';
import {
  buildActionExample,
  createSampleInputAction,
  createSampleTapAction,
} from './action-example';
import { buildPlanningResponseExample } from './planning-response-example';

type BuildPlanningMultiTurnExampleOptions = {
  includeSubGoals: boolean;
  locatePromptSpec?: LocateResultPromptSpec;
};

export const buildPlanningMultiTurnExample = ({
  includeSubGoals,
  locatePromptSpec,
}: BuildPlanningMultiTurnExampleOptions) => {
  const renderSubGoalsContent = (content: string, fallbackContent = '') =>
    includeSubGoals ? content : fallbackContent;

  const tapNameFieldExample = buildActionExample(
    createSampleTapAction('Name input field in the registration form'),
    {
      locatePromptSpec,
      locateResultExampleIndex: 2,
    },
  );
  const inputNameExample = buildActionExample(createSampleInputAction('John'));
  const tapEmailFieldExample = buildActionExample(
    createSampleTapAction('Email input field in the registration form'),
    {
      locatePromptSpec,
      locateResultExampleIndex: 3,
    },
  );
  const inputEmailExample = buildActionExample(
    createSampleInputAction('john@example.com'),
  );

  return `
## Multi-turn Conversation Example

Below is an example of a multi-turn conversation for "fill out the registration form with name 'John' and email 'john@example.com', then return the filled email address":

### Turn 1 - Initial instruction

**User message:**
<user_instruction>fill out the registration form with name 'John' and email 'john@example.com', then return the filled email address</user_instruction>

**Screenshot:** [Shows a registration form with empty Name and Email fields]

**Your response:**

${buildPlanningResponseExample({
  planning: `The user wants me to fill out the registration form with specific values and return the email address. I can see the form has two fields: Name and Email. Both are currently empty. ${renderSubGoalsContent(
    "I'll break this down into sub-goals and start with the Name field.",
    'I should start by clicking on the Name field.',
  )} Note: The instruction is to fill the form only (not submit), and return the email at the end.`,
  updateSubGoals: includeSubGoals
    ? [
        {
          index: 1,
          status: 'pending',
          description: "Fill in the Name field with 'John'",
        },
        {
          index: 2,
          status: 'pending',
          description: "Fill in the Email field with 'john@example.com'",
        },
        {
          index: 3,
          status: 'pending',
          description: 'Return the filled email address',
        },
      ]
    : undefined,
  log: 'Click on the Name field to start filling the form',
  actionExample: tapNameFieldExample,
})}

### Turn 2 - After clicking Name field

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.
${renderSubGoalsContent(`
Sub-goals:
1. Fill in the Name field with 'John' (running)
2. Fill in the Email field with 'john@example.com' (pending)
3. Return the filled email address (pending)
Current sub-goal is: Fill in the Name field with 'John'
Actions performed for current sub-goal:
- Click on the Name field to start filling the form`)}

**Screenshot:** [Shows the form with Name field now focused/active]

**Your response:**

${buildPlanningResponseExample({
  planning: `The Name field is now focused. I need to type 'John' into this field. ${renderSubGoalsContent(
    'Current sub-goal is running, will be completed after input.',
    "After this, I'll need to fill the Email field as well.",
  )}`,
  log: "Typing 'John' into the Name field",
  actionExample: inputNameExample,
})}

### Turn 3 - After entering name

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.
${renderSubGoalsContent(`
Sub-goals:
1. Fill in the Name field with 'John' (running)
2. Fill in the Email field with 'john@example.com' (pending)
3. Return the filled email address (pending)
Current sub-goal is: Fill in the Name field with 'John'
Actions performed for current sub-goal:
- Click on the Name field to start filling the form
- Typing 'John' into the Name field`)}

**Screenshot:** [Shows the form with Name field containing 'John']

**Your response:**

${buildPlanningResponseExample({
  planning: `The Name field now shows 'John'. ${renderSubGoalsContent(
    'Sub-goal 1 is complete. Next, I need to fill the Email field for sub-goal 2.',
    "Next, I need to fill the Email field with 'john@example.com'. I'll click on the Email field first.",
  )}`,
  markSubGoalsDone: includeSubGoals ? [1] : undefined,
  memory: includeSubGoals
    ? "Name field has been filled with 'John'"
    : undefined,
  log: 'Moving to the Email field',
  actionExample: tapEmailFieldExample,
})}

### Turn 4 - After clicking Email field

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.
${renderSubGoalsContent(`
Sub-goals:
1. Fill in the Name field with 'John' (finished)
2. Fill in the Email field with 'john@example.com' (running)
3. Return the filled email address (pending)
Current sub-goal is: Fill in the Email field with 'john@example.com'
Actions performed for current sub-goal:
- Moving to the Email field`)}

**Screenshot:** [Shows the form with Name='John' and Email field focused]

**Your response:**

${buildPlanningResponseExample({
  planning: `The Email field is now focused. I'll enter 'john@example.com'. ${renderSubGoalsContent(
    'After this, sub-goal 2 will be complete and my task will be done.',
    'After this, both required fields will be filled and my task will be complete.',
  )}`,
  log: 'Typing email address into the Email field',
  actionExample: inputEmailExample,
})}

### Turn 5 - After entering email (${renderSubGoalsContent('Goal accomplished', 'Instruction fulfilled')})

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.
${renderSubGoalsContent(`
Sub-goals:
1. Fill in the Name field with 'John' (finished)
2. Fill in the Email field with 'john@example.com' (running)
3. Return the filled email address (pending)
Current sub-goal is: Fill in the Email field with 'john@example.com'
Actions performed for current sub-goal:
- Moving to the Email field
- Typing email address into the Email field`)}

**Screenshot:** [Shows the form with Name='John' and Email='john@example.com']

**Your response:**

${buildPlanningResponseExample({
  planning: `Both fields are now filled: Name shows 'John' and Email shows 'john@example.com'. ${renderSubGoalsContent(
    "Sub-goal 2 is complete. The user asked me to return the filled email address, so I need to include 'john@example.com' in my response. All sub-goals are now finished.",
    "The user asked me to return the filled email address, so I should include 'john@example.com' in my response. The instruction has been fulfilled.",
  )}`,
  markSubGoalsDone: includeSubGoals ? [2, 3] : undefined,
  complete: {
    success: true,
    message: 'john@example.com',
  },
})}
`;
};
