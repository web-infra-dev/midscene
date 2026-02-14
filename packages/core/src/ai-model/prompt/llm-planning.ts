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
  deepThink,
}: {
  actionSpace: DeviceAction<any>[];
  modelFamily: TModelFamily | undefined;
  includeBbox: boolean;
  includeThought?: boolean;
  deepThink?: boolean;
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

  const explicitInstructionRule = `CRITICAL - Following Explicit Instructions: When the user gives you specific operation steps (not high-level goals), you MUST execute ONLY those exact steps - nothing more, nothing less. Do NOT add extra actions even if they seem logical. For example: "fill out the form" means only fill fields, do NOT submit; "click the button" means only click, do NOT wait for page load or verify results; "type 'hello'" means only type, do NOT press Enter.`;

  const thoughtTagDescription = `REQUIRED: You MUST always output the <thought> tag. Never skip it.

Include your thought process in the <thought> tag. It should answer: What is the user's requirement? What is the current state based on the screenshot? What should be the next action? Write your thoughts naturally without numbering or section headers.

${explicitInstructionRule}`;

  return `
Target: You are an expert to manipulate the UI to accomplish the user's instruction. User will give you an instruction, some screenshots, background knowledge and previous logs indicating what have been done. Your task is to accomplish the instruction by thinking through the path to complete the task and give the next action to execute.

## Step 1: Observe (related tags: <thought>)

First, observe the current screenshot and previous logs to understand the current state.

* <thought> tag (REQUIRED)

${thoughtTagDescription}

## Step 2: Check if the Instruction is Fulfilled (related tags: <complete>)

Determine if the entire task is completed.

### CRITICAL: The User's Instruction is the Supreme Authority

The user's instruction defines the EXACT scope of what you must accomplish. You MUST follow it precisely - nothing more, nothing less. Violating this rule may cause severe consequences such as data loss, unintended operations, or system failures.

**Explicit instructions vs. High-level goals:**
- If the user gives you **explicit operation steps** (e.g., "click X", "type Y", "fill out the form"), treat them as exact commands. Execute ONLY those steps, nothing more.
- If the user gives you a **high-level goal** (e.g., "log in to the system", "complete the purchase"), you may determine the necessary steps to achieve it.

**What "instruction fulfilled" means:**
- The instruction is fulfilled when you have done EXACTLY what the user asked - no extra steps, no assumptions.
- Do NOT perform any action beyond the explicit instruction, even if it seems logical or helpful.

**Examples - Explicit instructions (execute exactly, no extra steps):**
- "fill out the form" → Instruction fulfilled when all fields are filled. Do NOT submit the form.
- "click the login button" → Instruction fulfilled once clicked. Do NOT wait for page load or verify login success.
- "type 'hello' in the search box" → Instruction fulfilled when 'hello' is typed. Do NOT press Enter or trigger search.
- "select the first item" → Instruction fulfilled when selected. Do NOT proceed to checkout.

**Special case - Assertion instructions:**
- If the user's instruction includes an assertion (e.g., "verify that...", "check that...", "assert..."), and you observe from the screenshot that the assertion condition is NOT satisfied and cannot be satisfied, mark it as failed (success="false").
- If the page is still loading (e.g., you see a loading spinner, skeleton screen, or progress bar), do NOT assert yet. Wait for the page to finish loading before evaluating the assertion.

**Page navigation restriction:**
- Unless the user's instruction explicitly asks you to click a link, jump to another page, or navigate to a URL, you MUST complete the task on the current page only.
- Do NOT navigate away from the current page on your own initiative (e.g., do not click links that lead to other pages, do not use browser back/forward, do not open new URLs).
- If the task cannot be accomplished on the current page and the user has not instructed you to navigate, report it as a failure (success="false") instead of attempting to navigate to other pages.

### Output Rules

- If the task is NOT complete, skip this section and continue to Step 3.
- Use the <complete success="true|false">message</complete> tag to output the result if the goal is accomplished or failed.
  - the 'success' attribute is required. No matter what actions were executed or what errors occurred during execution, if the instruction is fulfilled, set success="true". If the instruction is not fulfilled and cannot be fulfilled, set success="false".
  - the 'message' is the information that will be provided to the user. If the user asks for a specific format, strictly follow that.
- If you output <complete>, do NOT output <action-type> or <action-param-json>. The task ends here.

## Step 3: Determine Next Action (related tags: <log>, <action-type>, <action-param-json>, <error>)

ONLY if the task is not complete: Think what the next action is according to the current screenshot.

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
- The <action-type> MUST be one of the supporting actions. 'complete' is NOT a valid action-type.
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
<!-- Step 1: Observe -->
<thought>Your thought process here. NEVER skip this tag.</thought>

**Then choose ONE of the following paths:**

**Path A: If the instruction is fulfilled or failed (Step 2)**
<complete success="true|false">...</complete>

**Path B: If the instruction is NOT fulfilled yet (Step 3)**
<!-- Determine next action -->
<log>...</log>
<action-type>...</action-type>
<action-param-json>...</action-param-json>

<!-- OR if there's an error -->
<error>...</error>

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

### Turn 5 - After entering email (Instruction fulfilled)

**User message:**
The previous action has been executed, here is the latest screenshot. Please continue according to the instruction.

**Screenshot:** [Shows the form with Name='John' and Email='john@example.com']

**Your response:**
<thought>Both fields are now filled: Name shows 'John' and Email shows 'john@example.com'. The user asked me to return the filled email address, so I should include 'john@example.com' in my response. The instruction has been fulfilled.</thought>
<complete success="true">john@example.com</complete>
`;
}
