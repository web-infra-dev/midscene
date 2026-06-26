import { createLocateResultAdapter } from '../shared/model-locate-result/factory';
import type { LocateResultAdapterDefinition } from '../shared/model-locate-result/types';
import { resolvePlanningTapLocator } from '../workflows/inspect/planning-action-locate';
import type { ResolvedCustomPlanningDefinition } from './custom-planning-types';
import type { LocateAdapter, ModelAdapterDefinition } from './types';

const defaultLocateResultAdapterDefinition: LocateResultAdapterDefinition = {
  coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
};

export function resolveLocate(
  locate: ModelAdapterDefinition['locate'],
  resolvedCustomPlanner: ResolvedCustomPlanningDefinition | undefined,
): LocateAdapter {
  if (locate?.kind === 'custom') {
    let locateFn = locate.locateFn;

    if (!locateFn) {
      const planningTapLocator = locate.planningTapLocator;

      if (!planningTapLocator) {
        throw new Error(
          'Custom locate definition requires either locateFn or planningTapLocator',
        );
      }

      if (!resolvedCustomPlanner) {
        throw new Error(
          'Custom planning tap locator requires a custom planning planner definition',
        );
      }
      locateFn = resolvePlanningTapLocator(
        planningTapLocator,
        resolvedCustomPlanner,
      );
    }

    return {
      kind: 'custom',
      supportsSearchArea: locate.supportsSearchArea ?? false,
      locateFn,
    };
  }

  return {
    kind: 'standard',
    supportsSearchArea: locate?.supportsSearchArea ?? true,
    resultAdapter: createLocateResultAdapter(
      locate?.resultAdapter ?? defaultLocateResultAdapterDefinition,
    ),
  };
}
