import { findAllMidsceneLocatorField, parseActionParam } from '@/common';
import type { PlanningAction } from '@/types';
import { assert } from '@midscene/shared/utils';
import type { PlanFn } from '../../workflows/planning/types';
import type { JevPlanningContext } from './planning-context';
import type { JevActionDecision } from './planning-decision';

export function buildJevAction(
  decision: JevActionDecision,
  context: JevPlanningContext,
  instruction: Parameters<PlanFn>[0],
): PlanningAction[] {
  const { choice } = decision;
  if (choice.kind === 'complete') {
    return [];
  }
  assert(
    choice.kind === 'action',
    'Delegated actions must use the default planner',
  );
  const action = choice.action;
  const fields = action.paramSchema
    ? findAllMidsceneLocatorField(action.paramSchema)
    : [];
  const param = Object.fromEntries(
    fields.map((field) => [
      field,
      {
        prompt: `Locate the target for parameter ${JSON.stringify(field)} of action ${JSON.stringify(action.name)} (${action.description ?? action.name}) for the NEXT step toward this goal. Use the current screenshot as authoritative and consider execution feedback. Task context: ${JSON.stringify(context.state)}`,
        images: instruction.referenceImages,
      },
    ]),
  );
  // Validate declared direct-action support before handing the plan to execution.
  parseActionParam(param, action.paramSchema);
  return [{ type: action.name, param }];
}
