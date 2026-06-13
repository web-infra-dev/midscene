/**
 * Gherkin step rendering: keyword-colored rows, `<param>` chips inside flow
 * bodies, routing badges mirroring the runtime router, data tables, doc
 * strings, and inline recursive flow-call expansion with cycle/depth guards.
 */
import { type ReactNode, useState } from 'react';
import {
  AGENT_MARKER_HINT,
  AGENT_ROUTE_LABEL,
  NOAI_MARKER_HINT,
  NOAI_ROUTE_LABEL,
} from '../model/copy';
import { type ModelIndices, argsSummary, pluralize } from '../model/indices';
import type { StepModel } from '../model/types';

// Mirrors IDENT_RE_SOURCE in packages/bdd/src/types.ts (placeholder names
// are identifiers); only used to locate chip positions inside step text —
// which placeholders are real comes from step.paramUses/paramIssues.
const PLACEHOLDER_RE = /<([A-Za-z_][A-Za-z0-9_]*)>/g;
const MAX_EXPANSION_DEPTH = 6;

/**
 * Step text with `<param>` placeholders rendered as chips: blue when bound
 * to a declared `@param:`, red when undeclared (the call would throw at
 * runtime). Scenario steps have no placeholder semantics, so their text
 * renders plain.
 */
function StepText({ step }: { step: StepModel }) {
  const bound = step.paramUses ?? [];
  const issues = step.paramIssues ?? [];
  if (bound.length === 0 && issues.length === 0) {
    return <span className="step-text">{step.text}</span>;
  }
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of step.text.matchAll(PLACEHOLDER_RE)) {
    const name = match[1];
    const bad = issues.includes(name);
    if (!bad && !bound.includes(name)) continue;
    const index = match.index ?? 0;
    if (index > last) parts.push(step.text.slice(last, index));
    parts.push(
      <span
        key={`${index}:${name}`}
        className={`var-chip${bad ? ' bad' : ''}`}
        title={
          bad
            ? 'undeclared placeholder — names no @param: of this flow; calling it fails at runtime'
            : 'flow parameter — bound by @param: and substituted at call time'
        }
      >
        {match[0]}
      </span>,
    );
    last = index + match[0].length;
  }
  if (last < step.text.length) parts.push(step.text.slice(last));
  return <span className="step-text">{parts}</span>;
}

/**
 * Routing badge mirroring the runtime router precedence: no-ai beats agent;
 * the default Midscene UI route stays badge-free so it reads quiet.
 */
function RouteBadges({ step }: { step: StepModel }) {
  const badges: ReactNode[] = [];
  if (step.route === 'no-ai') {
    badges.push(
      <span
        key="no-ai"
        className="badge badge-noai"
        title={`Runs a ${NOAI_ROUTE_LABEL} — ${NOAI_MARKER_HINT}`}
      >
        no-ai
      </span>,
    );
  } else if (step.route === 'agent') {
    const skills = step.annotations.skills.map((skill) => `$${skill}`);
    badges.push(
      <span
        key="agent"
        className="badge badge-agent"
        title={`Runs on the ${AGENT_ROUTE_LABEL}${
          skills.length > 0
            ? ` with ${pluralize('skill', skills.length)} ${skills.join(', ')}`
            : ''
        } — ${AGENT_MARKER_HINT}`}
      >
        {skills.length > 0 ? `agent · ${skills.join(' ')}` : 'agent'}
      </span>,
    );
  }
  if (step.annotations.soft) {
    badges.push(
      <span
        key="soft"
        className="badge badge-soft"
        title="Soft check — a failure is logged as a warning instead of failing the run"
      >
        soft
      </span>,
    );
  }
  if (badges.length === 0) return null;
  return <span className="step-badges">{badges}</span>;
}

function DataTable({ text }: { text: string }) {
  return (
    <table className="dt">
      <tbody>
        {text.split('\n').map((line, rowIndex) => (
          <tr key={rowIndex}>
            {line
              .split('|')
              .slice(1, -1)
              .map((cell, cellIndex) => (
                <td key={cellIndex}>{cell.trim()}</td>
              ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * One inline-expandable "→ Flow: ..." affordance under a flow-call step.
 * `path` is the chain of already-expanded owner/flow ids: cycles render a
 * note instead of recursing, and expansion is depth-capped as a backstop.
 */
function FlowCall({
  call,
  path,
  indices,
}: {
  call: NonNullable<StepModel['flowCall']>;
  path: string[];
  indices: ModelIndices;
}) {
  const [open, setOpen] = useState(false);
  const flow = indices.flowById.get(call.flowId);
  const summary = argsSummary(call.args);
  const label = `→ Flow: ${flow ? flow.name : call.flowId}${
    summary !== 'no args' ? `   (${summary})` : ''
  }`;

  let body: ReactNode = null;
  if (open) {
    if (!flow) {
      body = <div className="issue-note">Flow not found in this snapshot.</div>;
    } else if (path.includes(call.flowId)) {
      body = (
        <div className="issue-note">
          ↻ cycle — this flow is already expanded above
        </div>
      );
    } else if (path.length > MAX_EXPANSION_DEPTH) {
      body = <div className="issue-note">Maximum expansion depth reached.</div>;
    } else {
      body = flow.steps.map((step, index) => (
        <StepRow
          key={index}
          step={step}
          path={[...path, call.flowId]}
          indices={indices}
        />
      ));
    }
  }

  return (
    <div className="flow-call">
      <button
        type="button"
        className={`flow-toggle${open ? ' open' : ''}`}
        title={`Toggle inline expansion — ${summary}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className={`flow-caret${open ? ' open' : ''}`} aria-hidden="true">
          ▸
        </span>
        {label}
      </button>
      {open && <div className="flow-body">{body}</div>}
    </div>
  );
}

export function StepRow({
  step,
  path,
  indices,
}: {
  step: StepModel;
  path: string[];
  indices: ModelIndices;
}) {
  return (
    <div className={`step${step.paramIssues ? ' step-issue' : ''}`}>
      <div className="step-row">
        <span className={`kw kw-${step.stepType}`}>{step.keyword.trim()}</span>
        <span className="step-main">
          <StepText step={step} />
          <RouteBadges step={step} />
        </span>
      </div>
      {step.dataTable && <DataTable text={step.dataTable} />}
      {step.docString && <pre className="docstring">{step.docString}</pre>}
      {step.paramIssues && (
        <div className="issue-note">
          Undeclared {pluralize('placeholder', step.paramIssues.length)}:{' '}
          {step.paramIssues.map((name) => `<${name}>`).join(', ')} — not a
          declared @param: of this flow; calling it fails at runtime
        </div>
      )}
      {step.flowCall && (
        <FlowCall call={step.flowCall} path={path} indices={indices} />
      )}
    </div>
  );
}

/** Routing legend — only when the suite routes off the default UI agent. */
export function RoutingLegend() {
  return (
    <div className="route-legend">
      <span>Step routing:</span>
      <span className="badge badge-agent" title={AGENT_MARKER_HINT}>
        agent
      </span>
      <span>{AGENT_ROUTE_LABEL}</span>
      <span className="legend-dot">·</span>
      <span className="badge badge-noai" title={NOAI_MARKER_HINT}>
        no-ai
      </span>
      <span>classic user callback</span>
      <span className="legend-dot">·</span>
      <span>unmarked steps run on the Midscene UI agent</span>
    </div>
  );
}
