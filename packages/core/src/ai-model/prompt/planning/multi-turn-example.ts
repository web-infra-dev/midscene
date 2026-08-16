import type { LocateResultPromptSpec } from '../../shared/model-locate-result';
import {
  buildActionExample,
  createSampleInputAction,
  createSampleTapAction,
} from './action-example';

type BuildPlanningMultiTurnExampleOptions = {
  includeSubGoals: boolean;
  locatePromptSpec?: LocateResultPromptSpec;
};

export const buildPlanningMultiTurnExample = ({
  includeSubGoals,
  locatePromptSpec,
}: BuildPlanningMultiTurnExampleOptions) => {
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

  if (includeSubGoals) {
    return `
## Multi-turn Conversation Example

Below is an example of a multi-turn conversation for "fill out the registration form with name 'John' and email 'john@example.com', then return the filled email address":

### Turn 1 - Initial instruction

**User message:**
<user_instruction>fill out the registration form with name 'John' and email 'john@example.com', then return the filled email address</user_instruction>

**Screenshot:** [Shows a registration form with empty Name and Email fields]

**Your response:**
<planning>The user wants me to fill out the registration form with specific values and return the email address. I can see the form has two fields: Name and Email. Both are currently empty. I'll break this down into sub-goals and start with the Name field. Note: The instruction is to fill the form only (not submit), and return the email at the end.</planning>
<update-plan-content>
  <sub-goal index="1" status="pending">Fill in the Name field with 'John'</sub-goal>
  <sub-goal index="2" status="pending">Fill in the Email field with 'john@example.com'</sub-goal>
  <sub-goal index="3" status="pending">Return the filled email address</sub-goal>
</update-plan-content>
<log>Click on the Name field to start filling the form</log>
${tapNameFieldExample}

### Turn 2 - After clicking Name field

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

Sub-goals:
1. Fill in the Name field with 'John' (running)
2. Fill in the Email field with 'john@example.com' (pending)
3. Return the filled email address (pending)
Current sub-goal is: Fill in the Name field with 'John'
Actions performed for current sub-goal:
- Click on the Name field to start filling the form

**Screenshot:** [Shows the form with Name field now focused/active]

**Your response:**
<planning>The Name field is now focused. I need to type 'John' into this field. Current sub-goal is running, will be completed after input.</planning>
<log>Typing 'John' into the Name field</log>
${inputNameExample}

### Turn 3 - After entering name

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

Sub-goals:
1. Fill in the Name field with 'John' (running)
2. Fill in the Email field with 'john@example.com' (pending)
3. Return the filled email address (pending)
Current sub-goal is: Fill in the Name field with 'John'
Actions performed for current sub-goal:
- Click on the Name field to start filling the form
- Typing 'John' into the Name field

**Screenshot:** [Shows the form with Name field containing 'John']

**Your response:**
<planning>The Name field now shows 'John'. Sub-goal 1 is complete. Next, I need to fill the Email field for sub-goal 2.</planning>
<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
</mark-sub-goal-done>
<memory>Name field has been filled with 'John'</memory>
<log>Moving to the Email field</log>
${tapEmailFieldExample}

### Turn 4 - After clicking Email field

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

Sub-goals:
1. Fill in the Name field with 'John' (finished)
2. Fill in the Email field with 'john@example.com' (running)
3. Return the filled email address (pending)
Current sub-goal is: Fill in the Email field with 'john@example.com'
Actions performed for current sub-goal:
- Moving to the Email field

**Screenshot:** [Shows the form with Name='John' and Email field focused]

**Your response:**
<planning>The Email field is now focused. I'll enter 'john@example.com'. After this, sub-goal 2 will be complete and my task will be done.</planning>
<log>Typing email address into the Email field</log>
${inputEmailExample}

### Turn 5 - After entering email (Goal accomplished)

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

Sub-goals:
1. Fill in the Name field with 'John' (finished)
2. Fill in the Email field with 'john@example.com' (running)
3. Return the filled email address (pending)
Current sub-goal is: Fill in the Email field with 'john@example.com'
Actions performed for current sub-goal:
- Moving to the Email field
- Typing email address into the Email field

**Screenshot:** [Shows the form with Name='John' and Email='john@example.com']

**Your response:**
<planning>Both fields are now filled: Name shows 'John' and Email shows 'john@example.com'. Sub-goal 2 is complete. The user asked me to return the filled email address, so I need to include 'john@example.com' in my response. All sub-goals are now finished.</planning>
<mark-sub-goal-done>
  <sub-goal index="2" status="finished" />
  <sub-goal index="3" status="finished" />
</mark-sub-goal-done>
<complete success="true">john@example.com</complete>
`;
  }

  return `
## Multi-turn Conversation Example

Below is an example of a multi-turn conversation for "fill out the registration form with name 'John' and email 'john@example.com', then return the filled email address":

### Turn 1 - Initial instruction

**User message:**
<user_instruction>fill out the registration form with name 'John' and email 'john@example.com', then return the filled email address</user_instruction>

**Screenshot:** [Shows a registration form with empty Name and Email fields]

**Your response:**
<planning>The user wants me to fill out the registration form with specific values and return the email address. I can see the form has two fields: Name and Email. Both are currently empty. I should start by clicking on the Name field. Note: The instruction is to fill the form only (not submit), and return the email at the end.</planning>
<log>Click on the Name field to start filling the form</log>
${tapNameFieldExample}

### Turn 2 - After clicking Name field

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

**Screenshot:** [Shows the form with Name field now focused/active]

**Your response:**
<planning>The Name field is now focused. I need to type 'John' into this field. After this, I'll need to fill the Email field as well.</planning>
<log>Typing 'John' into the Name field</log>
${inputNameExample}

### Turn 3 - After entering name

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

**Screenshot:** [Shows the form with Name field containing 'John']

**Your response:**
<planning>The Name field now shows 'John'. Next, I need to fill the Email field with 'john@example.com'. I'll click on the Email field first.</planning>
<log>Moving to the Email field</log>
${tapEmailFieldExample}

### Turn 4 - After clicking Email field

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

**Screenshot:** [Shows the form with Name='John' and Email field focused]

**Your response:**
<planning>The Email field is now focused. I'll enter 'john@example.com'. After this, both required fields will be filled and my task will be complete.</planning>
<log>Typing email address into the Email field</log>
${inputEmailExample}

### Turn 5 - After entering email (Instruction fulfilled)

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

**Screenshot:** [Shows the form with Name='John' and Email='john@example.com']

**Your response:**
<planning>Both fields are now filled: Name shows 'John' and Email shows 'john@example.com'. The user asked me to return the filled email address, so I should include 'john@example.com' in my response. The instruction has been fulfilled.</planning>
<complete success="true">john@example.com</complete>
`;
};
