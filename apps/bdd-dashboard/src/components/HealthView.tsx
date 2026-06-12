import { memo } from 'react';
import { pluralize } from '../model/indices';
import type { ExploreModel, HealthFinding, HealthKind } from '../model/types';

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

// A template built by an older app can receive payloads with kinds it does
// not know; render them under their raw kind instead of crashing.
function kindMeta(kind: HealthKind): { label: string; severity: Severity } {
  return KIND_META[kind] ?? { label: kind, severity: 'warn' };
}

interface HealthViewProps {
  model: ExploreModel;
  onSelect: (id: string) => void;
}

/**
 * Jump to the scenario/flow whose header sits closest above the finding's
 * line. Findings without a line stay static text — guessing a story (e.g.
 * the file's first scenario) would open the wrong one more often than not.
 */
function jumpTarget(
  model: ExploreModel,
  finding: HealthFinding,
): string | null {
  const findingLine = finding.line;
  if (findingLine === undefined) return null;
  type Candidate = { id: string; uri: string; line: number };
  // `better` returns the winner so `best` is assigned at the top level and
  // TypeScript's flow analysis tracks it (closure mutation would not).
  const better = (current: Candidate | null, item: Candidate) =>
    item.uri === finding.uri &&
    item.line <= findingLine &&
    (!current || item.line > current.line)
      ? item
      : current;
  let best: Candidate | null = null;
  for (const flow of model.flows) best = better(best, flow);
  for (const feature of model.features) {
    for (const scenario of feature.scenarios) best = better(best, scenario);
  }
  return best ? best.id : null;
}

/** Payload arrives pre-sorted by kind (model.ts KIND_ORDER); group runs. */
function groupByKind(
  health: HealthFinding[],
): { kind: HealthKind; items: HealthFinding[] }[] {
  const sections: { kind: HealthKind; items: HealthFinding[] }[] = [];
  for (const finding of health) {
    const last = sections[sections.length - 1];
    if (last && last.kind === finding.kind) {
      last.items.push(finding);
    } else {
      sections.push({ kind: finding.kind, items: [finding] });
    }
  }
  return sections;
}

export const HealthView = memo(function HealthView({
  model,
  onSelect,
}: HealthViewProps) {
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
    (finding) => kindMeta(finding.kind).severity === 'error',
  ).length;
  const warnings = model.health.length - errors;

  return (
    <div className="health-view">
      <div className="health-summary">
        <span className="chip chip-errors">
          <b>{errors}</b>
          {pluralize('error', errors)}
        </span>
        <span className="chip chip-warnings">
          <b>{warnings}</b>
          {pluralize('warning', warnings)}
        </span>
        <span className="health-summary-hint">
          Click a finding's location to open it in Stories.
        </span>
      </div>
      {groupByKind(model.health).map(({ kind, items }) => {
        const meta = kindMeta(kind);
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
});
