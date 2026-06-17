import type { RefObject } from 'react';
import {
  AGENT_MARKER_HINT,
  AGENT_ROUTE_LABEL,
  NOAI_MARKER_HINT,
  NOAI_ROUTE_LABEL,
} from '../model/copy';
import type { DashboardView, ExploreModel } from '../model/types';

interface StatChip {
  value: number;
  label: string;
  className?: string;
  title?: string;
}

interface HeaderProps {
  model: ExploreModel;
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement>;
  onSearchEscape: () => void;
  onOpenHelp: () => void;
}

const TABS: { view: DashboardView; label: string; hint: string }[] = [
  {
    view: 'stories',
    label: 'Stories',
    hint: 'Browse every scenario and its steps',
  },
  {
    view: 'graph',
    label: 'Flow graph',
    hint: 'See how scenarios reuse shared flows',
  },
  {
    view: 'health',
    label: 'Health',
    hint: 'Problems found while parsing the suite',
  },
];

export function Header({
  model,
  view,
  onViewChange,
  query,
  onQueryChange,
  searchRef,
  onSearchEscape,
  onOpenHelp,
}: HeaderProps) {
  const chips: StatChip[] = [
    {
      value: model.stats.features,
      label: 'features',
      title: 'Gherkin Feature sections found in the suite',
    },
    {
      value: model.stats.scenarios,
      label: 'scenarios',
      title: 'Test cases (scenarios and scenario outlines) across all features',
    },
    {
      value: model.stats.flows,
      label: 'flows',
      title:
        'Reusable step sequences (scenarios tagged @flow) that other scenarios call as a single step',
    },
    {
      value: model.stats.steps,
      label: 'steps',
      title: 'Given/When/Then steps across the whole suite',
    },
    {
      value: model.stats.edges,
      label: 'flow calls',
      title: 'Steps that call a flow (including flows calling other flows)',
    },
  ];
  // Routing chips only when the suite actually routes off the default UI
  // agent, so plain suites keep a quiet header.
  if (model.stats.agentSteps > 0) {
    chips.push({
      value: model.stats.agentSteps,
      label: 'agent steps',
      className: 'chip-agent',
      title: `Steps routed to the ${AGENT_ROUTE_LABEL}, ${AGENT_MARKER_HINT}`,
    });
  }
  if (model.stats.noAiSteps > 0) {
    chips.push({
      value: model.stats.noAiSteps,
      label: 'no-ai steps',
      className: 'chip-noai',
      title: `Steps routed to a ${NOAI_ROUTE_LABEL}, ${NOAI_MARKER_HINT}`,
    });
  }

  const healthCount = model.health.length;

  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div className="brand-text">
          <h1>midscene-bdd dashboard</h1>
          <div className="base-dir" title={model.baseDir}>
            {model.baseDir}
          </div>
        </div>
      </div>

      <div className="stats" aria-label="suite stats">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className={`chip${chip.className ? ` ${chip.className}` : ''}`}
            title={chip.title}
          >
            <b>{chip.value}</b>
            {chip.label}
          </span>
        ))}
      </div>

      <div className="search-box">
        <svg
          className="search-icon"
          viewBox="0 0 16 16"
          aria-hidden="true"
          width="14"
          height="14"
        >
          <circle
            cx="7"
            cy="7"
            r="4.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <line
            x1="10.6"
            y1="10.6"
            x2="14"
            y2="14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <input
          ref={searchRef}
          type="search"
          placeholder="Search name, tag or step text…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onSearchEscape();
            }
          }}
          aria-label="Search stories and flows"
        />
        {query ? (
          <button
            type="button"
            className="search-clear"
            onClick={onSearchEscape}
            aria-label="Clear search"
          >
            ×
          </button>
        ) : (
          <kbd className="search-kbd">/</kbd>
        )}
      </div>

      <nav aria-label="views">
        {TABS.map((tab, index) => (
          <button
            type="button"
            key={tab.view}
            className={view === tab.view ? 'active' : ''}
            onClick={() => onViewChange(tab.view)}
            title={`${tab.hint} — press ${index + 1}`}
          >
            {tab.label}
            {tab.view === 'health' && (
              <span className={`pill${healthCount === 0 ? ' zero' : ''}`}>
                {healthCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <button
        type="button"
        className="help-btn"
        onClick={onOpenHelp}
        title="Glossary & keyboard shortcuts — press ?"
        aria-label="Open help: glossary and keyboard shortcuts"
      >
        ?
      </button>
    </header>
  );
}
