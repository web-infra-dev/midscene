import { MIDSCENE_PLANNING_DISABLE_PARTS } from '@midscene/shared/env';
import { getBasicEnvValue } from '@midscene/shared/env/basic';
import {
  buildActionDescription,
  buildPlanningActionOutput,
} from '../../model-adapter/default-planning-protocol';
import type { ModelRuntime } from '../../models';

export const PLANNING_ABLATION_PARTS = [
  'taskScope',
  'durableCompletion',
  'processEvidence',
  'observationGuidance',
  'planningText',
  'subGoals',
  'memory',
  'log',
  'screenshotHistory',
  'separateLocate',
  'scrollableOptions',
  'inputVerification',
  'assertionTiming',
  'recoveryGuidance',
  'adbPreference',
  'sliderSwipe',
  'incrementalEdit',
  'crossPageNavigation',
  'actionDescriptions',
  'groundingGuidance',
  'returnFormatReminder',
  'ruleExamples',
  'actionExamples',
  'multiTurnExample',
] as const;

export type PlanningAblationPart = (typeof PLANNING_ABLATION_PARTS)[number];
export type PlanningAblation = readonly PlanningAblationPart[];

export function parsePlanningAblation(value?: string): PlanningAblation {
  const disabled = new Set<string>();
  for (const name of (value ?? '').split(',').map((part) => part.trim())) {
    if (!name) continue;
    if (PLANNING_ABLATION_PARTS.some((part) => part === name)) {
      disabled.add(name);
    } else {
      throw new Error(
        `Unknown ${MIDSCENE_PLANNING_DISABLE_PARTS} part: "${name}". Supported parts: ${PLANNING_ABLATION_PARTS.join(', ')}.`,
      );
    }
  }
  return Object.freeze(
    PLANNING_ABLATION_PARTS.filter((part) => disabled.has(part)),
  );
}

export function readPlanningAblation(): PlanningAblation {
  return parsePlanningAblation(
    getBasicEnvValue(MIDSCENE_PLANNING_DISABLE_PARTS),
  );
}

export function planningPartEnabled(
  ablation: PlanningAblation | undefined,
  part: PlanningAblationPart,
): boolean {
  return !ablation?.includes(part);
}

/** Each component owns its prompt, examples and runtime behavior. */
export function resolvePlanningFeatures(ablation: PlanningAblation) {
  return {
    includeSubGoals: planningPartEnabled(ablation, 'subGoals'),
    includeMemory: planningPartEnabled(ablation, 'memory'),
    includeThought: planningPartEnabled(ablation, 'planningText'),
    logSource: planningPartEnabled(ablation, 'log')
      ? ('model' as const)
      : ('none' as const),
    imagesIncludeCount: planningPartEnabled(ablation, 'screenshotHistory')
      ? 2
      : 1,
    separateLocate: planningPartEnabled(ablation, 'separateLocate'),
  };
}

export function validatePlanningAblation(
  ablation: PlanningAblation,
  runtime: ModelRuntime,
  locateRuntime?: ModelRuntime,
) {
  if (!ablation.length) return;
  if (
    !planningPartEnabled(ablation, 'groundingGuidance') &&
    locateRuntime?.adapter.locate.kind === 'custom'
  ) {
    throw new Error(
      'Grounding guidance ablation is not supported by a custom locate adapter.',
    );
  }
  const { planning, chatCompletion } = runtime.adapter;
  if (planning.kind !== 'standard') {
    throw new Error('Planning ablation requires a standard planning adapter.');
  }
  const { protocol } = planning;
  if (
    protocol.actionOutputProtocol.buildActionOutput !==
      buildPlanningActionOutput ||
    protocol.actionSpaceProtocol.buildActionDescription !==
      buildActionDescription
  ) {
    throw new Error(
      'Planning ablation is not supported by this custom standard-planning protocol.',
    );
  }
  if (
    chatCompletion.replayRawAssistantMessage &&
    ablation.some((part) =>
      ['memory', 'subGoals', 'planningText', 'log'].includes(part),
    )
  ) {
    throw new Error(
      'Component ablation cannot filter an adapter that requires verbatim assistant replay.',
    );
  }
}
