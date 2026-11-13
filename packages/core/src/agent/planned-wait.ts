import { buildYamlFlowFromPlans } from '@/common';
import { defineAction } from '@/device';
import type { DeviceAction, PlanningAIResponse } from '@/types';
import { z } from 'zod';

/** Planning guidance is only attached when conditional waiting is enabled. */
export const plannedWaitContext = `Conditional waiting policy for all UI tasks:
- PRIORITY: An explicit current business error, permission denial, read-only account or validation failure overrides generic text such as "the interface may take time to respond". Do not reinterpret such an error as loading. If no user-authorized action can resolve it, fail immediately with the visible reason; do NOT WaitFor that prohibition to disappear or a disabled control to enable. Only an explicit indication of a temporary/in-progress recovery justifies waiting despite an error.
- If the latest screenshot already shows the next target visible and enabled, act immediately. Do NOT insert WaitFor or Sleep as a routine precaution before/after every action, or to recheck a condition that is already visibly satisfied.
- Before choosing WaitFor, identify a specific unmet prerequisite or a pending result of an already performed action. Explain that evidence briefly in the planning thought. A validation error or missing required user action is not an asynchronous wait.
- Before an interaction, inspect whether its target is currently visible and enabled. A disabled or loading control is not ready: use WaitFor for that prerequisite BEFORE attempting Tap. Do not test-click disabled controls.
- Choose the nearest unmet condition that can become true WITHOUT another user action. After entering text, if the next control is disabled, wait for that control to become enabled; do not wait for the final submission result before submitting.
- Preserve already entered text. Do not add/delete characters, clear/retype, refocus or press Enter just to force asynchronous UI state to update. Input content must only be changed when required by the user's task or an explicit validation error.
- An action call returning only proves dispatch, not application acceptance. Do not assume a disabled control accepted a click. For a dispatched action with pending UI feedback, wait for its relevant next state instead of replaying it merely because the screen is unchanged.
- WaitFor only observes. Once its prerequisite is satisfied, execute the pending action. Wait for an outcome only when the required triggering action has been performed on a ready control. Complete only when the user's requested end state is observed; do not expand the task scope.
- Never use Sleep as a substitute when a concrete visual readiness condition is available. Report explicit errors rather than waiting for impossible success.`;

export class PlannedWaitError extends Error {
  readonly code = 'PLANNED_WAIT_FAILED';
  constructor(cause: unknown) {
    super(
      `Planned WaitFor failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = 'PlannedWaitError';
  }
}

export function isPlannedWaitError(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === 'object' && !seen.has(error)) {
    seen.add(error);
    const value = error as { code?: unknown; cause?: unknown };
    if (value.code === 'PLANNED_WAIT_FAILED') return true;
    error = value.cause;
  }
  return false;
}

export function definePlannedWait(
  wait: (condition: string, signal?: AbortSignal) => Promise<void>,
) {
  return defineAction({
    name: 'WaitFor',
    description:
      'Wait for an unmet visible prerequisite or a pending result of an accepted action. Skip this if the current screenshot already satisfies the condition. Never wait for a result whose triggering action has not happened, or for an explicit business error to disappear. Only observes; does not click or edit. Times out after 30 seconds.',
    paramSchema: z.object({
      condition: z
        .string()
        .trim()
        .min(1)
        .describe(
          'The visible condition needed before continuing, which can become true without another user action.',
        ),
    }),
    delayBeforeRunner: 0,
    delayAfterRunner: 0,
    call: async ({ condition }, context) => {
      try {
        await wait(condition, context?.signal);
        if (context) {
          context.task.planningFeedback = `WaitFor succeeded: ${condition}. Continue from the current screenshot; do not repeat this wait unless new evidence shows the condition became false again.`;
        }
      } catch (error) {
        throw new PlannedWaitError(error);
      }
    },
  });
}

/** Discard actions whose coordinates predate a wait, including their cached flow. */
export function normalizePlannedWait(
  plan: PlanningAIResponse,
  actionSpace: DeviceAction[],
): PlanningAIResponse {
  if (plan.delegation || !plan.actions) return plan;
  const waitIndex = plan.actions.findIndex(
    (action) => action.type === 'WaitFor',
  );
  if (waitIndex < 0) return plan;
  const actions = plan.actions.slice(0, waitIndex + 1);
  return {
    ...plan,
    actions,
    yamlFlow: buildYamlFlowFromPlans(actions, actionSpace),
    shouldContinuePlanning: true,
  };
}
