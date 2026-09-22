import type { PlanningPromptContext } from '../planning-prompt-context';

export function getWorkflowSection(context: PlanningPromptContext): string {
  return `## Workflow

### Step 1: Observe (related tags: <planning>, <update-plan-content>, <mark-sub-goal-done>)
Read the user's instruction and inspect the current screenshot and available context.

### Step 2: Verify and Update (related tags: <planning>, <update-plan-content>, <mark-sub-goal-done>, <memory>)
Verify the previous action's actual result, if any, and update task progress from the available evidence. Maintain a structured plan and preserve information for later steps as needed.

### Step 3: Act or Finish (related tags: <log>, ${context.actionOutputTagsText}, <complete>, <error>)
Apply the Completion Rules to decide whether to finish. Otherwise, choose the next action.`;
}
