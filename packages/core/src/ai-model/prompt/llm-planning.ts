import type { DeviceAction } from '@/types';
import type { TModelFamily } from '@midscene/shared/env';
import { getPreferredLanguage } from '@midscene/shared/env';
import {
  getZodDescription,
  getZodTypeName,
} from '@midscene/shared/zod-schema-utils';
import type { z } from 'zod';
import { bboxDescription } from './common';

const vlLocateParam = (modelFamily: TModelFamily | undefined) => {
  if (modelFamily) {
    return `{bbox: [number, number, number, number], prompt: string } // ${bboxDescription(modelFamily)}`;
  }
  return '{ prompt: string /* description of the target element */ }';
};

/**
 * Find ZodDefault in the wrapper chain and return its default value
 */
const findDefaultValue = (field: unknown): any | undefined => {
  let current = field;
  const visited = new Set<unknown>();

  while (current && !visited.has(current)) {
    visited.add(current);
    const currentWithDef = current as {
      _def?: {
        typeName?: string;
        defaultValue?: () => any;
        innerType?: unknown;
      };
    };

    if (!currentWithDef._def?.typeName) break;

    if (currentWithDef._def.typeName === 'ZodDefault') {
      return currentWithDef._def.defaultValue?.();
    }

    // Continue unwrapping if it's a wrapper type
    if (
      currentWithDef._def.typeName === 'ZodOptional' ||
      currentWithDef._def.typeName === 'ZodNullable'
    ) {
      current = currentWithDef._def.innerType;
    } else {
      break;
    }
  }

  return undefined;
};

export const descriptionForAction = (
  action: DeviceAction<any>,
  locatorSchemaTypeDescription: string,
) => {
  const tab = '  ';
  const fields: string[] = [];

  // Add the action type field
  fields.push(`- type: "${action.name}"`);

  // Handle paramSchema if it exists
  if (action.paramSchema) {
    const paramLines: string[] = [];

    // Check if paramSchema is a ZodObject with shape
    const schema = action.paramSchema as {
      _def?: { typeName?: string };
      shape?: Record<string, unknown>;
    };
    const isZodObject = schema._def?.typeName === 'ZodObject';

    if (isZodObject && schema.shape) {
      // Original logic for ZodObject schemas
      const shape = schema.shape;

      for (const [key, field] of Object.entries(shape)) {
        if (field && typeof field === 'object') {
          // Check if field is optional
          const isOptional =
            typeof (field as { isOptional?: () => boolean }).isOptional ===
              'function' &&
            (field as { isOptional: () => boolean }).isOptional();
          const keyWithOptional = isOptional ? `${key}?` : key;

          // Get the type name using extracted helper
          const typeName = getZodTypeName(field, locatorSchemaTypeDescription);

          // Get description using extracted helper
          const description = getZodDescription(field as z.ZodTypeAny);

          // Check if field has a default value by searching the wrapper chain
          const defaultValue = findDefaultValue(field);
          const hasDefault = defaultValue !== undefined;

          // Build param line for this field
          let paramLine = `${keyWithOptional}: ${typeName}`;
          const comments: string[] = [];
          if (description) {
            comments.push(description);
          }
          if (hasDefault) {
            const defaultStr =
              typeof defaultValue === 'string'
                ? `"${defaultValue}"`
                : JSON.stringify(defaultValue);
            comments.push(`default: ${defaultStr}`);
          }
          if (comments.length > 0) {
            paramLine += ` // ${comments.join(', ')}`;
          }

          paramLines.push(paramLine);
        }
      }

      // Add the param section to fields if there are paramLines
      if (paramLines.length > 0) {
        fields.push('- param:');
        paramLines.forEach((line) => {
          fields.push(`  - ${line}`);
        });
      }
    } else {
      // Handle non-object schemas (string, number, etc.)
      const typeName = getZodTypeName(schema);
      const description = getZodDescription(schema as z.ZodTypeAny);

      // For simple types, indicate that param should be the direct value, not an object
      let paramDescription = `- param: ${typeName}`;
      if (description) {
        paramDescription += ` // ${description}`;
      }
      paramDescription += ' (pass the value directly, not as an object)';

      fields.push(paramDescription);
    }
  }

  return `- ${action.name}, ${action.description || 'No description provided'}
${tab}${fields.join(`\n${tab}`)}
`.trim();
};

export async function systemPromptToTaskPlanning({
  actionSpace,
  modelFamily,
  includeBbox,
  includeThought,
  includeSubGoals,
}: {
  actionSpace: DeviceAction<any>[];
  modelFamily: TModelFamily | undefined;
  includeBbox: boolean;
  includeThought?: boolean;
  includeSubGoals?: boolean;
}) {
  const preferredLanguage = getPreferredLanguage();

  // Validate parameters: if includeBbox is true, modelFamily must be defined
  if (includeBbox && !modelFamily) {
    throw new Error(
      'modelFamily cannot be undefined when includeBbox is true. A valid modelFamily is required for bbox-based location.',
    );
  }

  const actionDescriptionList = actionSpace.map((action) => {
    return descriptionForAction(
      action,
      vlLocateParam(includeBbox ? modelFamily : undefined),
    );
  });
  const actionList = actionDescriptionList.join('\n');

  const shouldIncludeThought = includeThought ?? true;
  const shouldIncludeSubGoals = includeSubGoals ?? false;

  // Generate locate object examples based on includeBbox
  const locateExample1 = includeBbox
    ? `{
    "prompt": "Add to cart button for Sauce Labs Backpack",
    "bbox": [345, 442, 458, 483]
  }`
    : `{
    "prompt": "Add to cart button for Sauce Labs Backpack"
  }`;

  // Locate examples for multi-turn conversation
  const locateNameField = includeBbox
    ? `{
    "prompt": "Name input field in the registration form",
    "bbox": [120, 180, 380, 210]
  }`
    : `{
    "prompt": "Name input field in the registration form"
  }`;

  const locateEmailField = includeBbox
    ? `{
    "prompt": "Email input field in the registration form",
    "bbox": [120, 240, 380, 270]
  }`
    : `{
    "prompt": "Email input field in the registration form"
  }`;

  const thoughtTag = (content: string) =>
    shouldIncludeThought ? `<thought>${content}</thought>\n` : '';

  // Sub-goals related content - only included when shouldIncludeSubGoals is true
  const step1Title = shouldIncludeSubGoals
    ? '## Step 1: Observe and Plan (related tags: <thought>, <update-plan-content>, <mark-sub-goal-done>)'
    : '## Step 1: Observe (related tags: <thought>)';

  const step1Description = shouldIncludeSubGoals
    ? "First, observe the current screenshot and previous logs, then break down the user's instruction into multiple high-level sub-goals. Update the status of sub-goals based on what you see in the current screenshot."
    : 'First, observe the current screenshot and previous logs to understand the current state.';

  const explicitInstructionRule = `CRITICAL - Following Explicit Instructions: When the user gives you specific operation steps (not high-level goals), you MUST execute ONLY those exact steps - nothing more, nothing less. Do NOT add extra actions even if they seem logical. For example: "fill out the form" means only fill fields, do NOT submit; "click the button" means only click, do NOT wait for page load or verify results; "type 'hello'" means only type, do NOT press Enter.`;

  const thoughtTagDescription = shouldIncludeSubGoals
    ? `REQUIRED: You MUST always output the <thought> tag. Never skip it.

Include your thought process in the <thought> tag. It should answer: What is the user's requirement? What is the current state based on the screenshot? Are all sub-goals completed? If not, what should be the next action? Write your thoughts naturally without numbering or section headers.

${explicitInstructionRule}`
    : `REQUIRED: You MUST always output the <thought> tag. Never skip it.

Include your thought process in the <thought> tag. It should answer: What is the current state based on the screenshot? What should be the next action? Write your thoughts naturally without numbering or section headers.

${explicitInstructionRule}`;

  const subGoalTags = shouldIncludeSubGoals
    ? `

* <update-plan-content> tag

Use this structure to give or update your plan:

<update-plan-content>
  <sub-goal index="1" status="finished|pending">sub goal description</sub-goal>
  <sub-goal index="2" status="finished|pending">sub goal description</sub-goal>
  ...
</update-plan-content>

* <mark-sub-goal-done> tag

Use this structure to mark a sub-goal as done:

<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
</mark-sub-goal-done>

IMPORTANT: You MUST only mark a sub-goal as "finished" AFTER you have confirmed the task is actually completed by observing the result in the screenshot. Do NOT mark a sub-goal as done just because you expect the next action will complete it. Wait until you see visual confirmation in the screenshot that the sub-goal has been achieved.

* Note

During execution, you can call <update-plan-content> at any time to update the plan based on the latest screenshot and completed sub-goals.

### Example

If the user wants to "log in to a system using username and password, complete all to-do items, and submit a registration form", you can break it down into the following sub-goals:

<thought>...</thought>
<update-plan-content>
  <sub-goal index="1" status="pending">Log in to the system</sub-goal>
  <sub-goal index="2" status="pending">Complete all to-do items</sub-goal>
  <sub-goal index="3" status="pending">Submit the registration form</sub-goal>
</update-plan-content>

After logging in and seeing the to-do items, you can mark the sub-goal as done:

<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
</mark-sub-goal-done>

At this point, the status of all sub-goals is:

<update-plan-content>
  <sub-goal index="1" status="finished" />
  <sub-goal index="2" status="pending" />
  <sub-goal index="3" status="pending" />
</update-plan-content>

After some time, when the last sub-goal is also completed, you can mark it as done as well:

<mark-sub-goal-done>
  <sub-goal index="3" status="finished" />
</mark-sub-goal-done>`
    : '';

  // Step numbering adjusts based on whether sub-goals are included
  // When includeSubGoals=false, memory step is skipped
  const memoryStepNumber = 2; // Only used when shouldIncludeSubGoals is true
  const checkGoalStepNumber = shouldIncludeSubGoals ? 3 : 2;
  const actionStepNumber = shouldIncludeSubGoals ? 4 : 3;

  return `
Target: You are an expert to manipulate the UI to accomplish the user's instruction. User will give you an instruction, some screenshots, background knowledge and previous logs indicating what have been done. Your task is to accomplish the instruction by thinking through the path to complete the task and give the next action to execute.

${step1Title}

${step1Description}

* <thought> tag (REQUIRED)

${thoughtTagDescription}
${subGoalTags}
${
  shouldIncludeSubGoals
    ? `
## Step ${memoryStepNumber}: Memory Data from Current Screenshot (related tags: <memory>)

While observing the current screenshot, if you notice any information that might be needed in follow-up actions, record it here. The current screenshot will NOT be available in subsequent steps, so this memory is your only way to preserve essential information. Examples: extracted data, element states, content that needs to be referenced.

Don't use this tag if no information needs to be preserved.
`
    : ''
}
## Step ${checkGoalStepNumber}: Check if Goal is Accomplished (related tags: <complete-goal>)

${shouldIncludeSubGoals ? 'Based on the current screenshot and the status of all sub-goals, determine' : 'Determine'} if the entire task is completed.

### CRITICAL: The User's Instruction is the Supreme Authority

The user's instruction defines the EXACT scope of what you must accomplish. You MUST follow it precisely - nothing more, nothing less. Violating this rule may cause severe consequences such as data loss, unintended operations, or system failures.

**Explicit instructions vs. High-level goals:**
- If the user gives you **explicit operation steps** (e.g., "click X", "type Y", "fill out the form"), treat them as exact commands. Execute ONLY those steps, nothing more.
- If the user gives you a **high-level goal** (e.g., "log in to the system", "complete the purchase"), you may determine the necessary steps to achieve it.

**What "goal accomplished" means:**
- The goal is accomplished when you have done EXACTLY what the user asked - no extra steps, no assumptions.
- Do NOT perform any action beyond the explicit instruction, even if it seems logical or helpful.

**Examples - Explicit instructions (execute exactly, no extra steps):**
- "fill out the form" → Goal accomplished when all fields are filled. Do NOT submit the form.
- "click the login button" → Goal accomplished once clicked. Do NOT wait for page load or verify login success.
- "type 'hello' in the search box" → Goal accomplished when 'hello' is typed. Do NOT press Enter or trigger search.
- "select the first item" → Goal accomplished when selected. Do NOT proceed to checkout.

**Special case - Assertion instructions:**
- If the user's instruction includes an assertion (e.g., "verify that...", "check that...", "assert..."), and you observe from the screenshot that the assertion condition is NOT satisfied and cannot be satisfied, mark the goal as failed (success="false").

**Special case - Conditional instructions:**
- If the user's instruction is conditional (e.g., "if ... then ...", "if there is a ... click ...", "when ... do ..."), and the condition is NOT satisfied (e.g., the element doesn't exist), this is NOT an error. Mark the goal as accomplished (success="true") and explain that the condition was not met so no action was taken.
- Example: "If there is a cookie consent prompt, click Accept" - if no cookie prompt exists, return <complete-goal success="true">No cookie consent prompt found on the page, no action needed</complete-goal>

### Output Rules

- If the task is NOT complete, skip this section and continue to Step ${actionStepNumber}.
- Use the <complete-goal success="true|false">message</complete-goal> tag to output the result if the goal is accomplished or failed.
  - the 'success' attribute is required. ${shouldIncludeSubGoals ? 'It means whether the expected goal is accomplished based on what you observe in the current screenshot. ' : ''}No matter what actions were executed or what errors occurred during execution, if the expected goal is accomplished, set success="true". If the expected goal is not accomplished and cannot be accomplished, set success="false".
  - the 'message' is the information that will be provided to the user. If the user asks for a specific format, strictly follow that.
- If you output <complete-goal>, do NOT output <action-type> or <action-param-json>. The task ends here.

## Step ${actionStepNumber}: Determine Next Action (related tags: <log>, <action-type>, <action-param-json>, <error>)

ONLY if the task is not complete: Think what the next action is according to the current screenshot${shouldIncludeSubGoals ? ' and the plan' : ''}.

- Don't give extra actions or plans beyond the instruction or the plan. For example, don't try to submit the form if the instruction is only to fill something.
- Consider the current screenshot and give the action that is most likely to accomplish the instruction. For example, if the next step is to click a button but it's not visible in the screenshot, you should try to find it first instead of give a click action.
- Make sure the previous actions are completed successfully. Otherwise, retry or do something else to recover.
- Give just the next ONE action you should do (if any)
- If there are some error messages reported by the previous actions, don't give up, try parse a new action to recover. If the error persists for more than 3 times, you should think this is an error and set the "error" field to the error message.

### Supporting actions list

${actionList}

### Log to give user feedback (preamble message)

The <log> tag is a brief preamble message to the user explaining what you're about to do. It should follow these principles and examples:

- **Use ${preferredLanguage}**
- **Keep it concise**: be no more than 1-2 sentences, focused on immediate, tangible next steps. (8–12 words or Chinese characters for quick updates).
- **Build on prior context**: if this is not the first action to be done, use the preamble message to connect the dots with what's been done so far and create a sense of momentum and clarity for the user to understand your next actions.
- **Keep your tone light, friendly and curious**: add small touches of personality in preambles feel collaborative and engaging.

**Examples:**
- <log>Click the login button</log>
- <log>Scroll to find the 'Yes' button in popup</log>
- <log>Previous actions failed to find the 'Yes' button, i will try again</log>
- <log>Go back to find the login button</log>

### If there is some action to do ...

- Use the <action-type> and <action-param-json> tags to output the action to be executed.
- The <action-type> MUST be one of the supporting actions. 'complete-goal' is NOT a valid action-type.
For example:
<action-type>Tap</action-type>
<action-param-json>
{
  "locate": ${locateExample1}
}
</action-param-json>

### If you think there is an error ...

- Use the <error> tag to output the error message.

For example:
<error>Unable to find the required element on the page</error>

### If there is no action to do ...

- Don't output <action-type> or <action-param-json> if there is no action to do.

## Return Format

Return in XML format following this decision flow:

**Always include (REQUIRED):**
<!-- Step 1: Observe${shouldIncludeSubGoals ? ' and Plan' : ''} -->
<thought>Your thought process here. NEVER skip this tag.</thought>
${
  shouldIncludeSubGoals
    ? `
<!-- required when no update-plan-content is provided in the previous response -->
<update-plan-content>...</update-plan-content>

<!-- required when any sub-goal is completed -->
<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
</mark-sub-goal-done>
`
    : ''
}${
  shouldIncludeSubGoals
    ? `
<!-- Step ${memoryStepNumber}: Memory data from current screenshot if needed -->
<memory>...</memory>
`
    : ''
}
**Then choose ONE of the following paths:**

**Path A: If the goal is accomplished or failed (Step ${checkGoalStepNumber})**
<complete-goal success="true|false">...</complete-goal>

**Path B: If the goal is NOT complete yet (Step ${actionStepNumber})**
<!-- Determine next action -->
<log>...</log>
<action-type>...</action-type>
<action-param-json>...</action-param-json>

<!-- OR if there's an error -->
<error>...</error>
${
  shouldIncludeSubGoals
    ? `
## Multi-turn Conversation Example

Below is an example of a multi-turn conversation for "fill out the registration form with name 'John' and email 'john@example.com', then return the filled email address":

### Turn 1 - Initial instruction

**User message:**
<user_instruction>fill out the registration form with name 'John' and email 'john@example.com', then return the filled email address</user_instruction>

**Screenshot:** [Shows a registration form with empty Name and Email fields]

**Your response:**
<thought>The user wants me to fill out the registration form with specific values and return the email address. I can see the form has two fields: Name and Email. Both are currently empty. I'll break this down into sub-goals and start with the Name field. Note: The instruction is to fill the form only (not submit), and return the email at the end.</thought>
<update-plan-content>
  <sub-goal index="1" status="pending">Fill in the Name field with 'John'</sub-goal>
  <sub-goal index="2" status="pending">Fill in the Email field with 'john@example.com'</sub-goal>
  <sub-goal index="3" status="pending">Return the filled email address</sub-goal>
</update-plan-content>
<log>Click on the Name field to start filling the form</log>
<action-type>Tap</action-type>
<action-param-json>
{
  "locate": ${locateNameField}
}
</action-param-json>

### Turn 2 - After clicking Name field

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

Sub-goals:
1. Fill in the Name field with 'John' (running)
2. Fill in the Email field with 'john@example.com' (pending)
Current sub-goal is: Fill in the Name field with 'John'

**Screenshot:** [Shows the form with Name field now focused/active]

**Your response:**
<thought>The Name field is now focused. I need to type 'John' into this field. Current sub-goal is running, will be completed after input.</thought>
<log>Typing 'John' into the Name field</log>
<action-type>Input</action-type>
<action-param-json>
{
  "value": "John"
}
</action-param-json>

### Turn 3 - After entering name

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

Sub-goals:
1. Fill in the Name field with 'John' (running)
2. Fill in the Email field with 'john@example.com' (pending)
Current sub-goal is: Fill in the Name field with 'John'

**Screenshot:** [Shows the form with Name field containing 'John']

**Your response:**
<thought>The Name field now shows 'John'. Sub-goal 1 is complete. Next, I need to fill the Email field for sub-goal 2.</thought>
<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
</mark-sub-goal-done>
<memory>Name field has been filled with 'John'</memory>
<log>Moving to the Email field</log>
<action-type>Tap</action-type>
<action-param-json>
{
  "locate": ${locateEmailField}
}
</action-param-json>

### Turn 4 - After clicking Email field

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

Sub-goals:
1. Fill in the Name field with 'John' (finished)
2. Fill in the Email field with 'john@example.com' (running)
Current sub-goal is: Fill in the Email field with 'john@example.com'

**Screenshot:** [Shows the form with Name='John' and Email field focused]

**Your response:**
<thought>The Email field is now focused. I'll enter 'john@example.com'. After this, sub-goal 2 will be complete and my task will be done.</thought>
<log>Typing email address into the Email field</log>
<action-type>Input</action-type>
<action-param-json>
{
  "value": "john@example.com"
}
</action-param-json>

### Turn 5 - After entering email (Goal accomplished)

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

Sub-goals:
1. Fill in the Name field with 'John' (finished)
2. Fill in the Email field with 'john@example.com' (running)
3. Return the filled email address (pending)
Current sub-goal is: Fill in the Email field with 'john@example.com'

**Screenshot:** [Shows the form with Name='John' and Email='john@example.com']

**Your response:**
<thought>Both fields are now filled: Name shows 'John' and Email shows 'john@example.com'. Sub-goal 2 is complete. The user asked me to return the filled email address, so I need to include 'john@example.com' in my response. All sub-goals are now finished.</thought>
<mark-sub-goal-done>
  <sub-goal index="2" status="finished" />
  <sub-goal index="3" status="finished" />
</mark-sub-goal-done>
<complete-goal success="true">john@example.com</complete-goal>
`
    : `
## Multi-turn Conversation Example

Below is an example of a multi-turn conversation for "fill out the registration form with name 'John' and email 'john@example.com', then return the filled email address":

### Turn 1 - Initial instruction

**User message:**
<user_instruction>fill out the registration form with name 'John' and email 'john@example.com', then return the filled email address</user_instruction>

**Screenshot:** [Shows a registration form with empty Name and Email fields]

**Your response:**
<thought>The user wants me to fill out the registration form with specific values and return the email address. I can see the form has two fields: Name and Email. Both are currently empty. I should start by clicking on the Name field. Note: The instruction is to fill the form only (not submit), and return the email at the end.</thought>
<log>Click on the Name field to start filling the form</log>
<action-type>Tap</action-type>
<action-param-json>
{
  "locate": ${locateNameField}
}
</action-param-json>

### Turn 2 - After clicking Name field

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

**Screenshot:** [Shows the form with Name field now focused/active]

**Your response:**
<thought>The Name field is now focused. I need to type 'John' into this field. After this, I'll need to fill the Email field as well.</thought>
<log>Typing 'John' into the Name field</log>
<action-type>Input</action-type>
<action-param-json>
{
  "value": "John"
}
</action-param-json>

### Turn 3 - After entering name

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

**Screenshot:** [Shows the form with Name field containing 'John']

**Your response:**
<thought>The Name field now shows 'John'. Next, I need to fill the Email field with 'john@example.com'. I'll click on the Email field first.</thought>
<log>Moving to the Email field</log>
<action-type>Tap</action-type>
<action-param-json>
{
  "locate": ${locateEmailField}
}
</action-param-json>

### Turn 4 - After clicking Email field

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

**Screenshot:** [Shows the form with Name='John' and Email field focused]

**Your response:**
<thought>The Email field is now focused. I'll enter 'john@example.com'. After this, both required fields will be filled and my task will be complete.</thought>
<log>Typing email address into the Email field</log>
<action-type>Input</action-type>
<action-param-json>
{
  "value": "john@example.com"
}
</action-param-json>

### Turn 5 - After entering email (Goal accomplished)

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

**Screenshot:** [Shows the form with Name='John' and Email='john@example.com']

**Your response:**
<thought>Both fields are now filled: Name shows 'John' and Email shows 'john@example.com'. The user asked me to return the filled email address, so I should include 'john@example.com' in my response. Goal accomplished.</thought>
<complete-goal success="true">john@example.com</complete-goal>
`
}`;
}
