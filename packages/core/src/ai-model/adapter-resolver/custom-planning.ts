import {
  createLocateResultAdapter,
  resolveLocateResultCoordinates,
} from '../shared/model-locate-result';
import type {
  CustomPlanningDefinition,
  ResolvedCustomPlanningDefinition,
} from '../workflows/planning/custom-planning-types';

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
