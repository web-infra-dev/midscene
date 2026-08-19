import {
  createLocateResultAdapter,
  resolveLocateResultCoordinates,
} from '../shared/model-locate-result';
import { runCustomPlanning } from '../workflows/planning/custom-planning';
import type {
  CustomPlanningDefinition,
  ResolvedCustomPlanningDefinition,
} from './custom-planning-types';
import { createDefaultMidscenePlanningProtocol } from './default-planning-protocol';
import type { StandardPlanningProtocolContext } from './planning-protocol';
import type { ModelAdapterDefinition, PlanningAdapter } from './types';

const defaultReplanningCycleLimit = 20;

export function resolveCustomPlanningDefinition<TParsed>(
  config: CustomPlanningDefinition<TParsed>,
): ResolvedCustomPlanningDefinition<TParsed> {
  const { coordinates, ...rest } = config;
  const coordinateSystem = resolveLocateResultCoordinates(coordinates);
  const coordinateNormalizer = createLocateResultAdapter({ coordinates });
  return {
    ...rest,
    coordinateSystem,
    coordinateNormalizer,
  };
}

export function resolvePlanning(
  planning: ModelAdapterDefinition['planning'],
  resolvedCustomPlanner: ResolvedCustomPlanningDefinition | undefined,
  protocolContext: StandardPlanningProtocolContext,
): PlanningAdapter {
  if (planning?.kind === 'custom') {
    if (typeof planning.planFn === 'function') {
      return {
        kind: 'custom',
        cacheEnabled: planning.cacheEnabled ?? false,
        defaultReplanningCycleLimit:
          planning.defaultReplanningCycleLimit ?? defaultReplanningCycleLimit,
        supportsActionDeepLocate: planning.supportsActionDeepLocate ?? false,
        planFn: planning.planFn,
      };
    }

    if (!resolvedCustomPlanner) {
      throw new Error('Custom planning planner definition is not resolved');
    }

    return {
      kind: 'custom',
      cacheEnabled: planning.cacheEnabled ?? false,
      defaultReplanningCycleLimit:
        planning.defaultReplanningCycleLimit ?? defaultReplanningCycleLimit,
      supportsActionDeepLocate: planning.supportsActionDeepLocate ?? false,
      coordinateSystem: resolvedCustomPlanner.coordinateSystem,
      planFn: (userInstruction, options) =>
        runCustomPlanning(userInstruction, options, resolvedCustomPlanner),
    };
  }

  const protocolDefinition =
    planning?.protocol ?? createDefaultMidscenePlanningProtocol;

  return {
    kind: 'standard',
    cacheEnabled: planning?.cacheEnabled ?? true,
    defaultReplanningCycleLimit:
      planning?.defaultReplanningCycleLimit ?? defaultReplanningCycleLimit,
    supportsActionDeepLocate: planning?.supportsActionDeepLocate ?? true,
    protocol:
      typeof protocolDefinition === 'function'
        ? protocolDefinition(protocolContext)
        : protocolDefinition,
  };
}
