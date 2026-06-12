import { memo } from 'react';
import { pluralize } from '../model/indices';
import type { ExploreModel, HealthFinding, HealthKind } from '../model/types';

type Severity = 'error' | 'warn';

interface KindMeta {
  label: string;
  severity: Severity;
  /** Plain-language "what this means / why it matters" for newcomers. */
  desc: string;
}

const KIND_META: Record<HealthKind, KindMeta> = {
  'ambiguous-flow-match': {
    label: 'Ambiguous flow matches',
    severity: 'error',
    desc: 'A step matches more than one flow, so the runner cannot tell which one to call. Rename one of the flows.',
  },
  'unknown-flow-sugar': {
    label: 'Unknown flow references',
    severity: 'error',
    desc: 'A step is written like a flow call, but no flow with that name exists — likely a typo or a missing @flow scenario.',
  },
  'flow-depth': {
    label: 'Flow call depth exceeded',
    severity: 'error',
    desc: 'These flows nest other flows deeper than the runtime allows, so calling them fails.',
  },
  'undeclared-param': {
    label: 'Undeclared flow-body placeholders',
    severity: 'error',
    desc: 'A flow step uses a <placeholder> that no @param: of that flow declares; calling the flow fails at runtime.',
  },
  'missing-skill': {
    label: 'Missing skills',
    severity: 'warn',
    desc: 'A $skill token names a skill that does not exist in the skills directory, so the agent step cannot load it.',
  },
  'detached-annotation': {
    label: 'Detached annotation comments (ignored)',
    severity: 'warn',
    desc: 'An annotation comment (# @agent, # @no-ai, …) is not directly above a step, so it silently has no effect.',
  },
  'tag-level-agent': {
    label: 'Tag-level @agent (ignored)',
    severity: 'warn',
    desc: '@agent only works as a comment directly above a step — as a tag on a scenario it is ignored.',
  },
  'unused-flow': {
    label: 'Unused flows',
    severity: 'warn',
    desc: 'No scenario or flow calls these flows. They may be dead weight — or a caller misspells their name.',
  },
};

// A template built by an older app can receive payloads with kinds it does
// not know; render them under their raw kind instead of crashing.
function kindMeta(kind: HealthKind): KindMeta {
  return KIND_META[kind] ?? { label: kind, severity: 'warn', desc: '' };
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
            {meta.desc && <p className="kind-desc">{meta.desc}</p>}
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
