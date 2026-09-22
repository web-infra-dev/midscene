import {
  buildActionOutputExample,
  createSampleTapAction,
} from '../action-output-example';
import type { PlanningPromptContext } from '../planning-prompt-context';

export function getOutputFormatSection(context: PlanningPromptContext): string {
  return `## Output Format

Return XML in this order: required analysis, optional updates, then exactly ONE outcome. Do not wrap the response in Markdown code fences or add text outside the tags.

${context.planningProtocol.responsePrefix ? `Start the response with ${context.planningProtocol.responsePrefix}.\n\n` : ''}### 1. Required analysis

Always include <planning>, including when finishing or reporting an error. Follow the Planning guidelines for its content.

<planning>Your analysis and next decision.</planning>

### 2. Optional updates

Include only the tags needed on this turn.

**Create or revise sub-goals:** Use <update-plan-content> with the full current plan, preserving existing goal indexes and unmet requirements. Each goal needs a positive integer index, a description, and a status of "pending" or "finished".

<update-plan-content>
  <sub-goal index="1" status="finished">Description of a confirmed completed goal</sub-goal>
  <sub-goal index="2" status="pending">Description of a remaining goal</sub-goal>
</update-plan-content>

**Mark confirmed completion:** Use <mark-sub-goal-done> to mark existing goals finished without repeating the plan. Include one self-closing <sub-goal> tag per completed goal.

<mark-sub-goal-done>
  <sub-goal index="1" status="finished" />
</mark-sub-goal-done>

Omit both tags when proceeding without sub-goals. An existing plan remains in effect when <update-plan-content> is omitted.

**Preserve information:** Use <memory> when information needs to be retained, following the Memory guidelines.

<memory>Task-relevant facts to preserve for later steps.</memory>

### 3. Choose ONE outcome

**A. Execute an action**

Output the <log> preamble, followed by ONE action using ${context.actionOutputTagsText}.

${context.actionOutputProtocol.actionOutputRules}

Example for a supported Tap action:

<log>Click the Add to cart button for Sauce Labs Backpack.</log>
${buildActionOutputExample(createSampleTapAction('Add to cart button for Sauce Labs Backpack'), { locatePromptSpec: context.locatePromptSpec, locateResultExampleIndex: 1, buildActionOutput: context.actionOutputProtocol.buildActionOutput })}

**B. Finish the task**

Use <complete> to end the task. Its "success" attribute is REQUIRED: "true" when the goal is confirmed accomplished under the Completion Rules, or "false" when it cannot be accomplished. The message is shown to the user and must follow any requested response format.

Choose one:
<complete success="true">The result requested by the user.</complete>
OR
<complete success="false">What could not be accomplished and why.</complete>

**C. Report an error**

Follow the action-recovery rules before reporting an error. Describe the actual problem:

<error>Unable to find the required element after repeated recovery attempts.</error>

For B or C, omit <log>, ${context.actionOutputTagsText}. Do not combine <complete> and <error>. Analysis, plan updates, or memory alone are not a complete response.`;
}
