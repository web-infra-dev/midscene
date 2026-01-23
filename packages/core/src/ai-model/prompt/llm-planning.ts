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
}: {
  actionSpace: DeviceAction<any>[];
  modelFamily: TModelFamily | undefined;
  includeBbox: boolean;
  includeThought?: boolean;
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

  const locateExample2 = includeBbox
    ? `{
    "prompt": "Add to cart button for Sauce Labs Bike Light",
    "bbox": [732, 442, 844, 483]
  }`
    : `{
    "prompt": "Add to cart button for Sauce Labs Bike Light"
  }`;

  const locateExample3 = includeBbox
    ? `{
    "prompt": "Cart icon in top right corner",
    "bbox": [956, 17, 982, 54]
  }`
    : `{
    "prompt": "Cart icon in top right corner"
  }`;

  const thoughtTag = (content: string) =>
    shouldIncludeThought ? `<thought>${content}</thought>\n` : '';

  return `
Target: You are an expert to manipulate the UI to accomplish the user's instruction. User will give you an instruction, some screenshots, background knowledge and previous logs indicating what have been done. Your task is to accomplish the instruction by thinking through the path to complete the task and give the next action to execute.

## Planning (related tags: <thought>, <update-plan-content>, <mark-sub-goal-done>)

According to the current screenshot and previous logs, break down the user's instruction into multiple high-level sub-goals. These sub-goals can be updated based on the current progress and screenshots.

* <thought> tag

Include your thought process in the <thought> tag, it should include the following information: What is the user's requirement? What is the current state based on the screenshot? What should be the next action and which action-type to use (or error, or complete-task)? Write your thoughts naturally without numbering or section headers.

* <update-plan-content> tag

Use this structure to give or update your plan:

<update-plan-content>
  <sub-goal index="1" status="finished|pending">sub goal description</sub-goal>
  <sub-goal index="2" status="finished|pending">sub goal description</sub-goal>
  ...
</update-plan-content>

Use this structure to mark a sub-goal as done:

* <mark-sub-goal-done> tag

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
</mark-sub-goal-done>

## Note data that will be needed in follow-up actions (related tags: <note>)

If any information from the current screenshot will be needed in follow-up actions, you MUST record it here completely. The current screenshot will NOT be available in subsequent steps, so this note is your only way to preserve essential information for later use. Examples: extracted data, element states, content that needs to be referenced. 

Don't use this tag if no follow-up information is needed.

## Determine Next Action (related tags: <log>, <action-type>, <action-param-json>, <complete-goal>, <log>)

Think what the next action is according to the current screenshot and the plan.

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
- Use <action-type>Print_Assert_Result</action-type> if the user clearly asks for an assertion.

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


## When the goal is accomplished or failed (related tags: <complete-goal>)

- Use the <complete-goal success="true|false">message</complete-goal> tag to output the result of the goal.
  - the 'success' attribute is required, it means whether the expected goal is accomplished. No matter what actions are executed and what error messages are reported during the execution, if the expected goal is accomplished, set success="true". If the expected goal is not accomplished, set success="false".
  - the 'message' is the information that will be provided to the user. If the user asks for a specific format, strictly follow that.
- If you output an action (<action-type>/<action-param-json>), do NOT output <complete-goal>.

## Return format

Return in XML format with the following structure:

<!-- always required -->
<thought>...</thought>

<!-- required when no update-plan-content is provided in the previous response -->
<update-plan-content>...</update-plan-content>

<!-- required when the current sub-goal is completed -->
<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
</mark-sub-goal-done>

<!-- required when there is some information that will be needed in follow-up actions -->
<note>...</note>

<!-- required when there is some action to do -->
<log>...</log>
<action-type>...</action-type>
<action-param-json>...</action-param-json>

<!-- required when the goal is completed or no more actions should be done -->
<complete-goal success="true|false">...</complete-goal>
`;
}
