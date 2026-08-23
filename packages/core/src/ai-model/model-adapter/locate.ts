import { createLocateResultCodec } from '../shared/model-locate-result/factory';
import type { LocateResultFormatDefinition } from '../shared/model-locate-result/types';
import { resolvePlanningTapLocator } from '../workflows/grounding/planning-action-locate';
import type { ResolvedCustomPlanningDefinition } from './custom-planning-types';
import {
  createDefaultElementProtocol,
  createDefaultSearchAreaProtocol,
} from './default-locate-protocol';
import type {
  StandardLocateProtocolContext,
  StandardLocateProtocolDefinition,
} from './locate-protocol';
import type { LocateAdapter, ModelAdapterDefinition } from './types';

const defaultLocateResultFormatDefinition: LocateResultFormatDefinition = {
  coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
};

const resolveLocateProtocolDefinition = (
  protocolDefinition: StandardLocateProtocolDefinition,
  protocolContext: StandardLocateProtocolContext,
) =>
  typeof protocolDefinition === 'function'
    ? protocolDefinition(protocolContext)
    : protocolDefinition;

export function resolveLocate(
  locate: ModelAdapterDefinition['locate'],
  resolvedCustomPlanner: ResolvedCustomPlanningDefinition | undefined,
  protocolContext: StandardLocateProtocolContext,
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
      locateFn,
    };
  }

  const elementProtocol = resolveLocateProtocolDefinition(
    locate?.element?.protocol ?? createDefaultElementProtocol,
    protocolContext,
  );
  const elementResultFormat =
    locate?.element?.resultFormat ?? defaultLocateResultFormatDefinition;
  const elementResultCodec = createLocateResultCodec(elementResultFormat);
  const searchAreaProtocol =
    locate?.searchArea === false
      ? undefined
      : resolveLocateProtocolDefinition(
          locate?.searchArea?.protocol ?? createDefaultSearchAreaProtocol,
          protocolContext,
        );
  const searchAreaResultFormat =
    locate?.searchArea === false
      ? undefined
      : (locate?.searchArea?.resultFormat ?? elementResultFormat);
  const searchAreaResultCodec = searchAreaResultFormat
    ? createLocateResultCodec(searchAreaResultFormat)
    : undefined;

  return {
    kind: 'standard',
    element: {
      protocol: elementProtocol,
      resultCodec: elementResultCodec,
    },
    ...(searchAreaProtocol && searchAreaResultCodec
      ? {
          searchArea: {
            protocol: searchAreaProtocol,
            resultCodec: searchAreaResultCodec,
          },
        }
      : {}),
  };
}
