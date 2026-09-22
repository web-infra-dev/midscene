import type { PlanningPromptContext } from '../planning-prompt-context';

export function getPlanningSection(context: PlanningPromptContext): string {
  return `## Planning

### <planning> tag (REQUIRED)

REQUIRED: You MUST output the <planning> tag on every turn, even when no sub-goals are used.

Write the content of the <planning> tag in ${context.preferredLanguage}.

Explain the user's requirement, the current state, and the observed result of the previous action, if any. Identify which requirements are satisfied, which remain unmet, and which still need verification. Apply the Completion Rules to decide whether to finish; otherwise, state the next action and why it is needed. Write naturally without numbering or section headers, and avoid repeating unchanged details.

### subgoals (optional, related tag: <update-plan-content>, <mark-sub-goal-done><sub-goal>)

Use sub-goals when requirements depend on one another, multiple outcomes must be coordinated, or progress and intermediate information must be tracked across multiple items or stages. For simple tasks with a clear, direct path, proceed without creating sub-goals.

When a plan is needed, break down the user's instruction into high-level sub-goals. Each sub-goal describes a required result or a user-specified operation, including its target and scope. For result-oriented requirements, state the result rather than the clicks or keystrokes used to reach it. Preserve any user-required order.

IMPORTANT: Mark a sub-goal as "finished" only after that sub-goal's required result or operation is confirmed. Use screenshots to verify results and available execution evidence to verify required operations. Do NOT mark it finished based on a planned action or its expected effect. If completion is uncertain, leave it unfinished and check what is missing.

#### Note

Use <update-plan-content> when new information changes the plan. Preserve unmet user requirements when changing the approach. If new evidence contradicts a finished status, update that sub-goal to "pending". Do not repeat an unchanged plan.`;
}
