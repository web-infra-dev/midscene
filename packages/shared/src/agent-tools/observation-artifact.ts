import type {
  BaseAgent,
  BaseUIObservation,
  UIObservationRecord,
} from './types';

/** CLI-only bridge between an Agent runtime and observation artifacts. */
export interface ObservationArtifactAdapter {
  exportRecord(observation: BaseUIObservation): Promise<UIObservationRecord>;
  loadRecord(record: UIObservationRecord): BaseUIObservation;
}

/** @internal Property key used by Core and the CLI artifact commands. */
export const observationArtifactAdapterSymbol = Symbol(
  'midscene.observationArtifactAdapter',
);

type ObservationArtifactAdapterHost = {
  [observationArtifactAdapterSymbol]?: ObservationArtifactAdapter;
};

/** Read the CLI artifact capability attached by the Core Agent. */
export function resolveObservationArtifactAdapter(
  agent: BaseAgent,
): ObservationArtifactAdapter | undefined {
  return (agent as ObservationArtifactAdapterHost)[
    observationArtifactAdapterSymbol
  ];
}
