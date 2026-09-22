import { buildPlanningMultiTurnExample } from '../multi-turn-example';
import type { PlanningPromptContext } from '../planning-prompt-context';

export function getExamplesSection(context: PlanningPromptContext): string {
  return buildPlanningMultiTurnExample({
    locatePromptSpec: context.locatePromptSpec,
    actionOutputProtocol: context.actionOutputProtocol,
    prefix: context.planningProtocol.responsePrefix,
  });
}
