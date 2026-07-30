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

export type ResolveObservationArtifactAdapter = (
  agent: BaseAgent,
) => ObservationArtifactAdapter | undefined;

const observationArtifactAdapter = Symbol(
  'midscene.observationArtifactAdapter',
);

type ObservationArtifactAdapterHost = {
  [observationArtifactAdapter]?: ObservationArtifactAdapter;
};

/** @internal Attach the CLI artifact capability without expanding Agent's API. */
export function registerObservationArtifactAdapter(
  agent: object,
  adapter: ObservationArtifactAdapter,
): void {
  Object.defineProperty(agent, observationArtifactAdapter, {
    configurable: false,
    enumerable: false,
    value: adapter,
    writable: false,
  });
}

/** Resolve the separately registered CLI artifact capability for an Agent. */
export const resolveObservationArtifactAdapter: ResolveObservationArtifactAdapter =
  (agent) =>
    (agent as ObservationArtifactAdapterHost)[observationArtifactAdapter];
