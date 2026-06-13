import { memo } from 'react';
import { type ModelIndices, plural } from '../model/indices';
import type { ExploreModel } from '../model/types';
import { RoutingLegend, StepRow } from './StepList';

interface DetailPaneProps {
  model: ExploreModel;
  indices: ModelIndices;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function CallerChip({
  callerId,
  indices,
  onSelect,
}: {
  callerId: string;
  indices: ModelIndices;
  onSelect: (id: string) => void;
}) {
  const flow = indices.flowById.get(callerId);
  const scenario = indices.scenarioById.get(callerId);
  const label = flow ? `flow: ${flow.name}` : (scenario?.name ?? callerId);
  return (
    <button
      type="button"
      className="chip clickable"
      onClick={() => onSelect(callerId)}
    >
      {label}
    </button>
  );
}

export const DetailPane = memo(function DetailPane({
  model,
  indices,
  selectedId,
  onSelect,
}: DetailPaneProps) {
  const flow = selectedId ? indices.flowById.get(selectedId) : undefined;
  const scenario = selectedId
    ? indices.scenarioById.get(selectedId)
    : undefined;
  const item = flow ?? scenario;

  if (!item) {
    return (
      <div className="detail">
        <div className="empty-state">
          <span className="empty-glyph" aria-hidden="true">
            ⌖
          </span>
          <p>Select a scenario or flow from the sidebar.</p>
        </div>
      </div>
    );
  }

  const feature = scenario
    ? indices.featureOfScenario.get(scenario.id)
    : undefined;
  const kicker = flow
    ? 'Flow'
    : scenario?.isOutline
      ? 'Scenario Outline'
      : 'Scenario';

  return (
    // Key on the item id so per-item UI state (flow expansions) resets and
    // the entry animation replays when the selection changes.
    <div className="detail" key={item.id}>
      <div className="detail-head">
        <div
          className="kicker"
          title={
            flow
              ? 'A reusable step sequence (@flow) that other scenarios call as a single step'
              : undefined
          }
        >
          {kicker}
          {feature && <span className="kicker-feature"> — {feature.name}</span>}
        </div>
        <h2>{item.name}</h2>
        <div className="detail-meta">
          <span className="loc">
            {item.uri}:{item.line}
          </span>
          {(scenario?.tags ?? []).map((tag) => (
            <span key={tag} className="chip tag-chip">
              {tag}
            </span>
          ))}
          {scenario?.isOutline && (
            <span
              className="chip"
              title="Steps below show the first Examples row expansion"
            >
              {plural(scenario.exampleCount ?? 0, 'example row')}
            </span>
          )}
          {flow && (
            <span className="chip">
              params: {flow.params.join(', ') || 'none'}
            </span>
          )}
          <span className="chip">{plural(item.steps.length, 'step')}</span>
        </div>
        {flow && (
          <div className="detail-meta callers">
            <span className="loc">Called by:</span>
            {flow.callers.length === 0 && (
              <span className="chip chip-unused">nobody (unused)</span>
            )}
            {flow.callers.map((callerId) => (
              <CallerChip
                key={callerId}
                callerId={callerId}
                indices={indices}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
        {feature?.description && (
          <p className="feature-description">{feature.description}</p>
        )}
      </div>

      <div className="steps-card">
        {item.steps.map((step, index) => (
          <StepRow key={index} step={step} path={[item.id]} indices={indices} />
        ))}
      </div>

      {(model.stats.agentSteps > 0 || model.stats.noAiSteps > 0) && (
        <RoutingLegend />
      )}
    </div>
  );
});
