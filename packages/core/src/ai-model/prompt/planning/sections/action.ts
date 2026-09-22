import { locateGroundingRules } from '../../locate';
import type { PlanningPromptContext } from '../planning-prompt-context';

export function getActionSection(context: PlanningPromptContext): string {
  return `## Action

### Choose the next action

- Use the current screenshot and available feedback to choose the next ONE action from the ${context.planningProtocol.actionSpaceProtocol.title} that advances the user's instruction.
- When a target is hidden or important details are missing, first reveal enough information to act: open details, expand content, preview, zoom, or scroll. Summaries, thumbnails, cropped content, and partially visible lists may omit details the task requires.
- You may navigate between pages as needed to accomplish the user's instruction. Respect any explicit instruction to stay on a page or avoid navigation.

${context.includeLocateInPlanning ? `${locateGroundingRules()}\n\n` : ''}${context.hasRunAdbShell ? "- If the user's task can be completed with the RunAdbShell action, prefer using the RunAdbShell action.\n\n" : ''}### Recover from action errors

- If an action fails or does not produce the required result, inspect the current state and account for any partial effects before retrying or choosing another recovery action.
- If the same error persists more than 3 times, report the error message using <error>message</error>.

### ${context.planningProtocol.actionSpaceProtocol.title}

${context.actionSpaceDescription}

### Log to give user feedback (preamble message)

Use <log> for a brief ${context.preferredLanguage} preamble describing the intended next action. Keep it to 1–2 short sentences with a clear, friendly tone.

Describe intent, not an unverified outcome; execution results are recorded separately. Refer to prior context only when it helps explain the next step.

#### Examples

- <log>Click the login button</log>
- <log>Scroll to find the 'Yes' button in popup</log>
- <log>The button is still hidden; I will expand the panel.</log>`;
}
