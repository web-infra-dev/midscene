import type { ExploreModel } from '@midscene/bdd';
import type { HealthFinding, HealthKind } from '../model/types';

type Severity = 'error' | 'warn';

const KIND_META: Record<HealthKind, { label: string; severity: Severity }> = {
  'ambiguous-flow-match': {
    label: 'Ambiguous flow matches',
    severity: 'error',
  },
  'unknown-flow-sugar': { label: 'Unknown flow references', severity: 'error' },
  'flow-depth': { label: 'Flow call depth exceeded', severity: 'error' },
  'undeclared-param': {
    label: 'Undeclared flow-body placeholders',
    severity: 'error',
  },
  'missing-skill': { label: 'Missing skills', severity: 'warn' },
  'detached-annotation': {
    label: 'Detached annotation comments (ignored)',
    severity: 'warn',
  },
  'tag-level-agent': { label: 'Tag-level @agent (ignored)', severity: 'warn' },
  'unused-flow': { label: 'Unused flows', severity: 'warn' },
};

const KIND_ORDER: HealthKind[] = [
  'ambiguous-flow-match',
  'unknown-flow-sugar',
  'flow-depth',
  'undeclared-param',
  'missing-skill',
  'detached-annotation',
  'tag-level-agent',
  'unused-flow',
];

interface HealthViewProps {
  model: ExploreModel;
  onSelect: (id: string) => void;
}

/** Best effort: jump to the scenario/flow that contains the finding's line. */
function jumpTarget(
  model: ExploreModel,
  finding: HealthFinding,
): string | null {
  let best: { id: string; line: number } | null = null;
  const consider = (item: { id: string; uri: string; line: number }) => {
    if (item.uri !== finding.uri) return;
    if (finding.line !== undefined && item.line > finding.line) return;
    if (!best || item.line > best.line) best = { id: item.id, line: item.line };
  };
  for (const flow of model.flows) consider(flow);
  for (const feature of model.features) {
    for (const scenario of feature.scenarios) consider(scenario);
  }
  if (best) return (best as { id: string }).id;
  const feature = model.features.find((f) => f.relPath === finding.uri);
  return feature?.scenarios[0]?.id ?? null;
}

export function HealthView({ model, onSelect }: HealthViewProps) {
  if (model.health.length === 0) {
    return (
      <div className="health-view">
        <div className="empty-state">
          <span className="empty-glyph healthy" aria-hidden="true">
            ✓
          </span>
          <p>No findings — the suite looks healthy.</p>
        </div>
      </div>
    );
  }

  const errors = model.health.filter(
    (finding) => KIND_META[finding.kind].severity === 'error',
  ).length;
  const warnings = model.health.length - errors;

  return (
    <div className="health-view">
      <div className="health-summary">
        <span className="chip chip-errors">
          <b>{errors}</b>
          {errors === 1 ? 'error' : 'errors'}
        </span>
        <span className="chip chip-warnings">
          <b>{warnings}</b>
          {warnings === 1 ? 'warning' : 'warnings'}
        </span>
        <span className="health-summary-hint">
          Click a finding's location to open it in Stories.
        </span>
      </div>
      {KIND_ORDER.map((kind) => {
        const items = model.health.filter((finding) => finding.kind === kind);
        if (items.length === 0) return null;
        const meta = KIND_META[kind];
        return (
          <section className="health-section" key={kind}>
            <h3>
              <span className={`kind-badge kind-${meta.severity}`}>{kind}</span>
              <span>{meta.label}</span>
              <span className="count">{items.length}</span>
            </h3>
            <div className="health-rows">
              {items.map((finding, index) => {
                const target = finding.uri ? jumpTarget(model, finding) : null;
                return (
                  <div className="health-row" key={index}>
                    <span
                      className={`severity-dot ${meta.severity}`}
                      aria-hidden="true"
                    />
                    <span className="health-msg">{finding.message}</span>
                    {finding.uri &&
                      (target ? (
                        <button
                          type="button"
                          className="health-loc"
                          title="Open in Stories"
                          onClick={() => onSelect(target)}
                        >
                          {finding.uri}
                          {finding.line ? `:${finding.line}` : ''}
                        </button>
                      ) : (
                        <span className="health-loc static">
                          {finding.uri}
                          {finding.line ? `:${finding.line}` : ''}
                        </span>
                      ))}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
